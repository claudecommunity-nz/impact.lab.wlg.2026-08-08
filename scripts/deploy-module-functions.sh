#!/usr/bin/env bash
# ============================================================================
# deploy-module-functions.sh — deploy every module's Supabase Edge Functions.
#
# Discovers modules/<team>/backend/functions/<name>/index.ts and deploys each to
# the shared project as  <module-id>-<name>  (prefixed so two teams can both
# have a "notify" function without colliding). Edge Functions are Deno; they run
# in Supabase's edge runtime, NOT on a participant laptop.
#
# This is an ORGANISER step: deploying needs a Supabase personal access token
# (SUPABASE_ACCESS_TOKEN in .env, from supabase.com/dashboard/account/tokens) —
# a loader's anon key cannot deploy code.
#
# Usage (repo root, .env populated):
#   bash scripts/deploy-module-functions.sh                 # deploy all
#   bash scripts/deploy-module-functions.sh team-x          # only one module
#
# Local dev instead of deploy:  npx supabase functions serve --env-file .env
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  set -a; source .env; set +a
fi
: "${SUPABASE_URL:?missing SUPABASE_URL (export it or add it to .env)}"
: "${SUPABASE_ACCESS_TOKEN:?missing SUPABASE_ACCESS_TOKEN (export it or add it to .env)}"

SUPABASE_BIN="${SUPABASE_BIN:-$(command -v supabase || true)}"
[ -n "$SUPABASE_BIN" ] || {
  echo "supabase CLI not found — install it or set SUPABASE_BIN" >&2
  exit 1
}

# project ref = the subdomain of SUPABASE_URL (https://<ref>.supabase.co)
REF="$(printf '%s' "$SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')"
ONLY="${1:-}"

# The CLI deploys functions found under supabase/functions/<name>/. We stage each
# module function there under its collision-proof slug, deploy, then clean up.
mkdir -p supabase/functions
# ${STAGED[@]+...}: expanding an empty array under set -u is an unbound-variable
# error on macOS's default bash 3.2 — guard the expansion.
cleanup() { rm -rf ${STAGED[@]+"${STAGED[@]}"} 2>/dev/null || true; }
STAGED=()
trap cleanup EXIT

shopt -s nullglob
found=0
failed=0
for dir in modules/*/backend/functions/*/; do
  [ -f "${dir}index.ts" ] || continue
  module_id="$(printf '%s' "$dir" | sed -E 's#modules/([^/]+)/.*#\1#')"
  # _-prefixed folders (_template) are scaffold source, never deployable.
  case "$module_id" in _*) continue ;; esac
  fn_name="$(basename "$dir")"
  [ -n "$ONLY" ] && [ "$ONLY" != "$module_id" ] && continue
  found=1
  slug="${module_id}-${fn_name}"

  stage="supabase/functions/${slug}"
  STAGED+=("$stage")
  rm -rf "$stage"; mkdir -p "$stage"
  cp -R "${dir}." "$stage/"

  echo "deploying ${dir}index.ts  →  function \"${slug}\" (project ${REF})"
  if "$SUPABASE_BIN" functions deploy "$slug" --project-ref "$REF" --use-api --no-verify-jwt; then
    echo "  ✓ https://${REF}.supabase.co/functions/v1/${slug}"
  else
    echo "  ✗ deploy failed for ${slug}"
    failed=1
  fi
done

[ "$found" = 1 ] || echo "no module edge functions found (modules/*/backend/functions/*/index.ts)"
if [ "$failed" = 1 ]; then
  echo "ERROR: one or more deploys failed (see ✗ above)" >&2
  exit 1
fi
