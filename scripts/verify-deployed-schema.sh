#!/usr/bin/env bash
# Verify every manifest-backed module table exists with the platform's required
# RLS, public-read grants, and shared realtime publication membership.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  set -a; source .env; set +a
fi
: "${SUPABASE_DB_URL:?missing SUPABASE_DB_URL (export it or add it to .env)}"

PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
[ -x "$PSQL" ] || { echo "psql not found — install PostgreSQL client tools"; exit 1; }

# The enable_module_table() calls are the authoritative list of tables each
# module schema intends to expose. Names are constrained by the module contract.
tables="$(
  sed -nE "s/.*enable_module_table\\('public\\.([a-z0-9_]+)'\\).*/\\1/p" \
    modules/*/backend/schema.sql 2>/dev/null | sort -u
)"

if [ -z "$tables" ]; then
  echo "no module-owned tables declared — nothing to verify"
  exit 0
fi

failed=0
for table in $tables; do
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
        has_table_privilege('authenticated', 'public.${table}', 'SELECT')::int;
    "
  )"
  if [ "$result" = "1|1|1|1|1" ]; then
    echo "  ✓ public.${table} (exists, RLS, realtime, public read)"
  else
    echo "  ✗ public.${table} verification returned ${result}" >&2
    failed=1
  fi
done

[ "$failed" = 0 ] || {
  echo "ERROR: deployed module schema verification failed" >&2
  exit 1
}
echo "all declared module tables verified."

