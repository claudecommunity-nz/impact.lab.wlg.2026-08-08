#!/usr/bin/env bash
# Verify every manifest-backed module table exists with the platform's required
# RLS, public-read grants, and shared realtime publication membership.
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
[ -x "$PSQL" ] || { echo "psql not found — install PostgreSQL client tools"; exit 1; }

# The schema path supplies the expected owner; enable_module_table() calls supply
# its physical tables. Keep both so verification catches a table accidentally
# configured for another module, not merely the presence of some RLS policy.
declarations="$(
  for schema in modules/*/backend/schema.sql; do
    [ -f "$schema" ] || continue
    module_id="$(printf '%s' "$schema" | sed -E 's#modules/([^/]+)/.*#\1#')"
    case "$module_id" in _*) continue ;; esac
    sed -nE "s/.*enable_module_table\\('public\\.([a-z0-9_]+)'\\).*/\\1/p" "$schema" |
      while IFS= read -r table; do
        [ -n "$table" ] && printf '%s|%s\n' "$module_id" "$table"
      done
  done | sort -u
)"

if [ -z "$declarations" ]; then
  echo "no module-owned tables declared — nothing to verify"
  exit 0
fi

failed=0
while IFS='|' read -r module_id table; do
  result="$(
    "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At -F '|' -c "
      select
        (to_regclass('public.${table}') is not null)::int,
        coalesce((
          select c.relrowsecurity::int
          from pg_class c
          where c.oid = to_regclass('public.${table}')
        ), 0),
        exists(
          select 1 from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = '${table}'
        )::int,
        has_table_privilege('anon', 'public.${table}', 'SELECT')::int,
        has_table_privilege('authenticated', 'public.${table}', 'SELECT')::int,
        exists(
          select 1
          from private.module_table_owners o
          where o.table_oid = to_regclass('public.${table}')::oid
            and o.module_id = '${module_id}'
        )::int,
        (
          select count(*) = 3
          from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = '${table}'
            and p.policyname in (
              'wcc_write_insert',
              'wcc_write_update',
              'wcc_write_delete'
            )
            and (
              coalesce(p.qual, '') || coalesce(p.with_check, '')
            ) like '%module_write_ok%'
        )::int;
    "
  )"
  if [ "$result" = "1|1|1|1|1|1|1" ]; then
    echo "  ✓ public.${table} (owner ${module_id}, scoped writes, RLS, realtime, public read)"
  else
    echo "  ✗ public.${table} owner ${module_id} verification returned ${result}" >&2
    failed=1
  fi
done <<EOF
$declarations
EOF

[ "$failed" = 0 ] || {
  echo "ERROR: deployed module schema verification failed" >&2
  exit 1
}
echo "all declared module tables verified with per-module write ownership."
