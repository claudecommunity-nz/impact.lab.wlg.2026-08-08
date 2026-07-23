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
# Usage (repo root, SUPABASE_DB_URL exported or .env populated,
# wcc.enable_module_table already migrated in):
#   bash scripts/apply-module-backends.sh
#
# Requirements: psql (brew install libpq). NEVER commit any connection string.
# ============================================================================
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
[ -x "$PSQL" ] || { echo "psql not found — brew install libpq"; exit 1; }

shopt -s nullglob
schemas=()
for schema in modules/*/backend/schema.sql; do
  module_id="$(printf '%s' "$schema" | sed -E 's#modules/([^/]+)/.*#\1#')"
  case "$module_id" in _*) continue ;; esac
  schemas+=("$schema")
done
if [ ${#schemas[@]} -eq 0 ]; then
  echo "no module schemas found (modules/*/backend/schema.sql) — nothing to apply"
  exit 0
fi

echo "applying ${#schemas[@]} module schema(s)…"
for f in "${schemas[@]}"; do
  module_id="$(printf '%s' "$f" | sed -E 's#modules/([^/]+)/.*#\1#')"
  echo "  → $f"
  # A schema file either lands completely or not at all. This prevents an
  # interrupted CREATE/ALTER sequence leaving a half-configured module table.
  # The process-local owner context lets the schema's one-argument
  # enable_module_table() call install RLS for exactly this folder's module id.
  PGOPTIONS="-c wcc.deploying_module_id=${module_id}" \
    "$PSQL" "$SUPABASE_DB_URL" \
    -v ON_ERROR_STOP=1 \
    -q \
    --single-transaction \
    -f "$f"
done
echo "module backends applied."
