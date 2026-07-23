#!/usr/bin/env bash
# Provision, rotate, revoke, and inspect per-module write credentials.
#
# Plaintext tokens are generated locally, sent to Postgres over the privileged
# connection through stdin/environment (not command arguments), and shown once
# for the organiser to place on that team's check-in card. The database stores
# only SHA-256 plus the final six-character operator hint.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
explicit_db_url="${SUPABASE_DB_URL:-}"
if [ -f .env ]; then
  set -a; source .env; set +a
fi
[ -z "$explicit_db_url" ] || SUPABASE_DB_URL="$explicit_db_url"
unset explicit_db_url
: "${SUPABASE_DB_URL:?missing SUPABASE_DB_URL (export it or add it to .env)}"

PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
[ -x "$PSQL" ] || { echo "psql not found — install PostgreSQL client tools" >&2; exit 1; }

usage() {
  cat >&2 <<'EOF'
Usage:
  bash scripts/module-credentials.sh provision <module-id>
  bash scripts/module-credentials.sh rotate <module-id>
  bash scripts/module-credentials.sh revoke <module-id>
  bash scripts/module-credentials.sh status [module-id]
  bash scripts/module-credentials.sh assign-user <email> <module-id>
  bash scripts/module-credentials.sh unassign-user <email>
  bash scripts/module-credentials.sh legacy-enable <minutes>
  bash scripts/module-credentials.sh legacy-disable

Provision/rotate prints MODULE_TOKEN exactly once. Never paste it into chat,
issues, CI logs, source files, or browser environment variables.
EOF
  exit 1
}

valid_module_id() {
  [[ "$1" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]
}

command="${1:-}"
case "$command" in
  provision|rotate)
    module_id="${2:-}"
    valid_module_id "$module_id" || { echo "invalid module id: ${module_id:-<missing>}" >&2; exit 1; }

    if [ "$command" = "provision" ]; then
      exists="$(
        WCC_MODULE_ID="$module_id" "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
\getenv module_id WCC_MODULE_ID
select exists (
  select 1 from private.module_credentials where module_id = :'module_id'
)::int;
SQL
      )"
      [ "$exists" = "0" ] || {
        echo "credential already exists for ${module_id}; use rotate explicitly" >&2
        exit 1
      }
    fi

    token="$(
      openssl rand -base64 36 |
        tr '+/' '-_' |
        tr -d '=\n'
    )"
    WCC_MODULE_ID="$module_id" WCC_MODULE_TOKEN="$token" \
      "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
\getenv module_id WCC_MODULE_ID
\getenv module_token WCC_MODULE_TOKEN
select public.rotate_module_credential(:'module_id', :'module_token');
SQL
    action_label="provisioned"
    [ "$command" = "rotate" ] && action_label="rotated"
    echo "${action_label} credential for ${module_id}; previous token/revocation is no longer valid."
    echo "Copy this once to ${module_id}'s check-in card or secure password manager:"
    echo "MODULE_TOKEN=${token}"
    ;;

  revoke)
    module_id="${2:-}"
    valid_module_id "$module_id" || { echo "invalid module id: ${module_id:-<missing>}" >&2; exit 1; }
    WCC_MODULE_ID="$module_id" \
      "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
\getenv module_id WCC_MODULE_ID
select public.revoke_module_credential(:'module_id');
SQL
    echo "revoked ${module_id}; loaders and assigned browser users are blocked immediately."
    ;;

  status)
    module_id="${2:-}"
    if [ -n "$module_id" ]; then
      valid_module_id "$module_id" || { echo "invalid module id: $module_id" >&2; exit 1; }
    fi
    WCC_MODULE_ID="$module_id" \
      "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
\getenv module_id WCC_MODULE_ID
select
  module_id,
  case when revoked_at is null then 'active' else 'revoked' end as state,
  token_suffix,
  created_at,
  rotated_at,
  revoked_at
from private.module_credentials
where nullif(:'module_id', '') is null or module_id = :'module_id'
order by module_id;

select
  legacy_module_writes_until,
  coalesce(legacy_module_writes_until > now(), false) as legacy_window_open
from private.event_config
where id;
SQL
    ;;

  assign-user)
    email="${2:-}"
    module_id="${3:-}"
    [[ "$email" == *@* ]] || { echo "a user email is required" >&2; exit 1; }
    valid_module_id "$module_id" || { echo "invalid module id: ${module_id:-<missing>}" >&2; exit 1; }
    updated="$(
      WCC_USER_EMAIL="$email" WCC_MODULE_ID="$module_id" \
        "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
\getenv user_email WCC_USER_EMAIL
\getenv module_id WCC_MODULE_ID
with changed as (
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('module_id', :'module_id')
  where lower(email) = lower(:'user_email')
  returning id
)
select count(*) from changed;
SQL
    )"
    [ "$updated" = "1" ] || {
      echo "no unique Supabase Auth user found for ${email}; create/invite them first" >&2
      exit 1
    }
    echo "assigned ${email} to ${module_id}; the user must sign out/in to receive a fresh JWT."
    ;;

  unassign-user)
    email="${2:-}"
    [[ "$email" == *@* ]] || { echo "a user email is required" >&2; exit 1; }
    updated="$(
      WCC_USER_EMAIL="$email" \
        "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
\getenv user_email WCC_USER_EMAIL
with changed as (
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'module_id'
  where lower(email) = lower(:'user_email')
  returning id
)
select count(*) from changed;
SQL
    )"
    [ "$updated" = "1" ] || {
      echo "no unique Supabase Auth user found for ${email}" >&2
      exit 1
    }
    echo "removed ${email}'s module assignment; revoke the module for immediate blocking, or have the user sign out/in."
    ;;

  legacy-enable)
    minutes="${2:-}"
    [[ "$minutes" =~ ^[0-9]+$ ]] && [ "$minutes" -ge 1 ] && [ "$minutes" -le 1440 ] || {
      echo "legacy window must be 1–1440 minutes" >&2
      exit 1
    }
    WCC_LEGACY_MINUTES="$minutes" \
      "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
\getenv legacy_minutes WCC_LEGACY_MINUTES
select public.set_legacy_module_write_window(
  now() + make_interval(mins => :'legacy_minutes'::integer)
);
SQL
    echo "WARNING: legacy room-token writes are enabled for ${minutes} minutes."
    echo "Every legacy request must still declare x-module-id, but the shared token can impersonate it."
    ;;

  legacy-disable)
    "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q \
      -c "select public.set_legacy_module_write_window(null);"
    echo "legacy room-token writes disabled."
    ;;

  *)
    usage
    ;;
esac
