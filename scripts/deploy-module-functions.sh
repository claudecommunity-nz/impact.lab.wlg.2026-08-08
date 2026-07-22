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
set -a; source .env; set +a
: "${SUPABASE_URL:?missing in .env}" "${SUPABASE_ACCESS_TOKEN:?missing in .env — organiser personal access token}"

# project ref = the subdomain of SUPABASE_URL (https://<ref>.supabase.co)
REF="$(printf '%s' "$SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')"
ONLY="${1:-}"

# The CLI deploys functions found under supabase/functions/<name>/. We stage each
# module function there under its collision-proof slug, deploy, then clean up.
mkdir -p supabase/functions
cleanup() { rm -rf "${STAGED[@]}" 2>/dev/null || true; }
STAGED=()
trap cleanup EXIT

shopt -s nullglob
found=0
for dir in modules/*/backend/functions/*/; do
  [ -f "${dir}index.ts" ] || continue
  module_id="$(printf '%s' "$dir" | sed -E 's#modules/([^/]+)/.*#\1#')"
  fn_name="$(basename "$dir")"
  [ -n "$ONLY" ] && [ "$ONLY" != "$module_id" ] && continue
  found=1
  slug="${module_id}-${fn_name}"

  stage="supabase/functions/${slug}"
  STAGED+=("$stage")
  rm -rf "$stage"; mkdir -p "$stage"
  cp -R "${dir}." "$stage/"

  echo "deploying ${dir}index.ts  →  function \"${slug}\" (project ${REF})"
  if npx --yes supabase functions deploy "$slug" --project-ref "$REF" --use-api --no-verify-jwt; then
    echo "  ✓ https://${REF}.supabase.co/functions/v1/${slug}"
  else
    echo "  ✗ deploy failed for ${slug}"
  fi
done

[ "$found" = 1 ] || echo "no module edge functions found (modules/*/backend/functions/*/index.ts)"
