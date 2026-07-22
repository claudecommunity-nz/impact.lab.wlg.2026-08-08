#!/usr/bin/env bash
# ============================================================================
# apply-module-backends.sh — apply every module's Postgres schema to the DB.
#
# Discovers modules/<team>/backend/schema.sql and runs each against SUPABASE_DB_URL
# (organiser step — DDL needs a privileged connection, not a loader's anon key).
# Schemas must be idempotent (`create table if not exists ...` +
# `select wcc.enable_module_table('public.m_<id>_<name>')`), so re-running is safe
# and is how you add or change a module's tables mid-event.
#
# Usage (repo root, .env populated, wcc.enable_module_table already migrated in):
#   bash scripts/apply-module-backends.sh
#
# Requirements: psql (brew install libpq). NEVER commit any connection string.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
: "${SUPABASE_DB_URL:?missing in .env}"

PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
[ -x "$PSQL" ] || { echo "psql not found — brew install libpq"; exit 1; }

shopt -s nullglob
schemas=(modules/*/backend/schema.sql)
if [ ${#schemas[@]} -eq 0 ]; then
  echo "no module schemas found (modules/*/backend/schema.sql) — nothing to apply"
  exit 0
fi

echo "applying ${#schemas[@]} module schema(s)…"
for f in "${schemas[@]}"; do
  echo "  → $f"
  "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "module backends applied."
