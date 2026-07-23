#!/usr/bin/env bash
# CI-only proof that a failed transactional schema application leaves no
# partially-created object behind. Run only against the ephemeral local stack.
set -euo pipefail

: "${SUPABASE_DB_URL:?missing SUPABASE_DB_URL}"
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
[ -x "$PSQL" ] || { echo "psql not found — install PostgreSQL client tools"; exit 1; }
probe="wcc_deploy_failure_probe"

if [ "$("$PSQL" "$SUPABASE_DB_URL" -Atc "select to_regclass('public.${probe}') is not null;")" != "f" ]; then
  echo "failure-drill probe table already exists; refusing to touch it" >&2
  exit 1
fi

set +e
"$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction >/dev/null 2>&1 <<SQL
create table public.${probe} (id integer primary key);
select 1 / 0;
SQL
status=$?
set -e

if [ "$status" = 0 ]; then
  echo "expected the representative schema deployment to fail" >&2
  exit 1
fi

exists="$("$PSQL" "$SUPABASE_DB_URL" -Atc "select to_regclass('public.${probe}') is not null;")"
if [ "$exists" != "f" ]; then
  echo "failed deployment left public.${probe} behind" >&2
  exit 1
fi

echo "failure drill passed: the representative error rolled back the whole schema transaction."
