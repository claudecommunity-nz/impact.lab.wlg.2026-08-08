#!/usr/bin/env bash
# ============================================================================
# cloud-wire.sh — one-shot organiser wiring of the LIVE Supabase project.
# Applies migrations, sets the event token, loads the seed, then runs the
# 4-step RLS drill and the realtime-publication check.
#
# Usage (from the repo root, .env populated from the check-in card):
#   bash scripts/cloud-wire.sh
#
# Requirements: psql (brew install libpq), npx (Node 22), curl.
#
# CONNECTIVITY NOTE (found 22 Jul 2026): db.<ref>.supabase.co is IPv6-only.
# On an IPv4-only network you must use the Session Pooler connection string
# from Dashboard → Connect (host aws-0-ap-northeast-1.pooler.supabase.com,
# user postgres.<ref>, port 5432) as SUPABASE_DB_URL. If the pooler says
# "password authentication failed", reset the database password in
# Dashboard → Settings → Database (this re-syncs the pooler), update .env,
# and re-run. NEVER commit any connection string.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- env ---------------------------------------------------------------------
set -a; source .env; set +a
: "${SUPABASE_URL:?missing in .env}" "${SUPABASE_PUBLISHABLE_KEY:?missing in .env}"
: "${SUPABASE_DB_URL:?missing in .env}" "${EVENT_TOKEN:?missing in .env}"

PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
[ -x "$PSQL" ] || { echo "psql not found — brew install libpq"; exit 1; }

echo "==> 1/8 applying migrations (supabase db push)"
npx supabase db push --db-url "$SUPABASE_DB_URL" --yes

echo "==> 1b/8 applying module backends (modules/*/backend/schema.sql)"
bash scripts/apply-module-backends.sh

echo "==> 2/8 setting event token in private.event_config (value not shown)"
"$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "insert into private.event_config (id, token) values (true, '${EVENT_TOKEN}')
      on conflict (id) do update set token = excluded.token;"

echo "==> 3/8 loading supabase/seed.sql"
"$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

# Give PostgREST pooled connections a moment to pick up the new setting.
sleep 5

# --- RLS drill ----------------------------------------------------------------
rest() { # method path expected_status(es, pipe-separated) extra-args...
  # `expect` may list several acceptable codes: a blocked write is correctly
  # rejected as either 401 (no auth role for the op) or 403 (RLS/grant denial) —
  # both mean "denied", which is the security property the drill asserts.
  local method="$1" path="$2" expect="$3"; shift 3
  local code
  code=$(curl -s -o /tmp/cloud-wire-body -w "%{http_code}" -X "$method" \
    "$SUPABASE_URL/rest/v1/$path" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" "$@")
  case "|$expect|" in
    *"|$code|"*) echo "  PASS ($method $path -> $code)";;
    *) echo "  FAIL ($method $path -> $code, wanted $expect)"; cat /tmp/cloud-wire-body; echo
       DRILL_FAILED=1;;
  esac
}
DRILL_FAILED=0
SIGNAL='{"module_id":"demo-seed","title":"RLS drill","signal_type":"drill","source_type":"official"}'

echo "==> 4/8 RLS drill"
echo "  (a) insert WITH x-event-token must succeed"
rest POST "signals" 201 -H "x-event-token: $EVENT_TOKEN" -H "Content-Type: application/json" -d "$SIGNAL"
echo "  (b) insert WITHOUT token must fail"
rest POST "signals" "401|403" -H "Content-Type: application/json" -d "$SIGNAL"
echo "  (c) update modules.enabled with publishable key must fail"
rest PATCH "modules?id=eq.demo-seed" "401|403" -H "x-event-token: $EVENT_TOKEN" \
  -H "Content-Type: application/json" -d '{"enabled":false}'
echo "  (d) anonymous select of signals must succeed"
rest GET "signals?select=id&limit=1" 200

echo "==> 5/8 cleaning up drill signal"
"$PSQL" "$SUPABASE_DB_URL" -q -c "delete from public.signals where signal_type = 'drill';"

echo "==> 6/8 realtime publication check (want signals + modules)"
"$PSQL" "$SUPABASE_DB_URL" -Atc \
  "select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;"

# --- Full scenario seed -------------------------------------------------------
# seed.sql above is a 6-row opening snapshot; the demo-seed loader is the REAL
# story seed (~5,000 signals from data/earthquake_story.json). It DELETES the
# demo-seed rows above and inserts the full scenario over the shared table via
# the event token — the same write path every team uses. This is a required
# publish step: without it the cloud shows only the opening snapshot.
echo "==> 7/8 seeding the full earthquake scenario (demo-seed loader)"
if command -v uv >/dev/null 2>&1; then
  uv run --directory modules/demo-seed/loader --package demo-seed-loader \
    python -m src.main seed \
    && echo "  full scenario seeded" \
    || { echo "  WARN: loader seed failed — schema/token/RLS are still wired; re-run:
    uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main seed"; }
else
  echo "  SKIP: uv not found — run the full seed yourself with:
    uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main seed"
fi

echo "==> 8/8 deploying module edge functions"
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  bash scripts/deploy-module-functions.sh || echo "  WARN: some edge functions failed to deploy"
else
  echo "  SKIP: SUPABASE_ACCESS_TOKEN not set (organiser personal access token). Deploy later:
    bash scripts/deploy-module-functions.sh"
fi

[ "$DRILL_FAILED" = 0 ] && echo "ALL WIRING STEPS COMPLETE" || { echo "RLS DRILL FAILED"; exit 1; }
