#!/usr/bin/env node
/**
 * RLS / event-token assertions for CI (PLAN §7.4; docs/CONTRACTS.md §3–4).
 * Runs ONLY against the ephemeral `supabase start` stack — never against live.
 *
 * Asserts, in order:
 *   1. modules INSERT without `x-event-token` is rejected
 *   2. modules INSERT with the token succeeds (payload omits `enabled` — CONTRACTS.md §4)
 *   3. modules heartbeat-style UPDATE with the token succeeds
 *   4. signals INSERT with the token succeeds
 *   5. signals INSERT without the token is rejected
 *   6. signals INSERT with a wrong token is rejected
 *   7. signals INSERT with title > 200 chars is rejected (guardrail)
 *   7a. signals triage UPDATE by an authenticated user WITHOUT the token is
 *      denied (0 rows) — the triage policy is room-gated like every other write
 *   7b. signals triage UPDATE by an authenticated user WITH the token succeeds
 *   7c. storage upload under an enabled module prefix WITH the token succeeds
 *   7d. storage upload WITHOUT the token is rejected
 *   8. anon + token cannot flip modules.enabled (kill-switch is service-role-only)
 *   9. service role CAN flip enabled=false (the kill-switch itself)
 *  10. signals INSERT with the token for the now-DISABLED module is rejected
 *  10a. storage upload for the now-DISABLED module is rejected (kill-switch)
 *  11. anon SELECT needs no token (the feed is public by design)
 *
 * Usage (the CI workflow sets these after `supabase start` + ALTER DATABASE):
 *   SUPABASE_API_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=<local anon key> \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> \
 *   CI_EVENT_TOKEN=ci-only-event-token \
 *   node .github/scripts/rls-assertions.mjs
 */

const API = (process.env.SUPABASE_API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
const ANON_KEY = need("SUPABASE_ANON_KEY");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const TOKEN = need("CI_EVENT_TOKEN");
const MODULE_ID = "ci-rls-probe";

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(2);
  }
  return v;
}

/**
 * One PostgREST request. `token` (when given) is sent as the `x-event-token`
 * header — omitted entirely otherwise, matching read-only client behaviour.
 * `key` picks anon (default) vs service role for the apikey gateway header.
 * `bearer` (when given) overrides the Authorization JWT — used to act as a
 * signed-in `authenticated` user while keeping apikey = the anon key, exactly
 * as supabase-js does after sign-in.
 * @example const r = await rest("POST", "/signals", { token: TOKEN, body: {...} });
 */
async function rest(method, path, { key = ANON_KEY, token, body, bearer } = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${bearer ?? key}`,
    Prefer: "return=representation",
  };
  if (token !== undefined) headers["x-event-token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}/rest/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

/**
 * Mint an `authenticated` session: create a confirmed user via the GoTrue admin
 * API (service role) then exchange the password for an access token. Returned
 * JWT carries role=authenticated — the only role that exercises the triage
 * UPDATE policy (anon is blocked by the column grant; service role bypasses RLS).
 */
async function authToken() {
  const email = `ci-rls-${Date.now()}@example.com`;
  const password = "ci-rls-probe-pw-1234567890";
  await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let access;
  try {
    access = JSON.parse(await res.text()).access_token;
  } catch {
    /* leave access undefined — caller asserts it is truthy */
  }
  return access;
}

/**
 * One Storage upload. Same token/key semantics as rest(): `token` is the
 * `x-event-token` header, apikey/Authorization use `key` (anon by default).
 * Distinct object names per call — the bucket has no UPDATE/DELETE policy, so a
 * repeated key would 409 rather than re-test the policy.
 */
async function storageUpload(objectPath, { key = ANON_KEY, token } = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "text/plain",
  };
  if (token !== undefined) headers["x-event-token"] = token;
  const res = await fetch(`${API}/storage/v1/object/${objectPath}`, {
    method: "POST",
    headers,
    body: "ci-rls-probe payload",
  });
  return { status: res.status, body: await res.text() };
}

/** Retry until `isOk` — the ALTER DATABASE token setting reaches PostgREST as
 *  pooled connections recycle, so the first token-gated write may lag. */
async function withRetry(fn, isOk, attempts = 10, delayMs = 2000) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (isOk(last)) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

const signalPayload = (overrides = {}) => ({
  module_id: MODULE_ID,
  title: "CI probe: waves over the road at Owhiro Bay",
  signal_type: "ci-probe",
  source_type: "sensor",
  severity: "unknown",
  ...overrides,
});

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  PASS" : "✗ FAIL"}  ${name}`);
  if (!ok) {
    console.log(`         → ${detail}`);
    failed++;
  }
}

// Client payloads must NEVER include `enabled` (CONTRACTS.md §4).
const moduleRow = {
  id: MODULE_ID,
  name: "CI RLS Probe",
  icon: "🧪",
  description: "Ephemeral CI-only module for RLS assertions.",
  problem: 1,
};

// 1. Registration without the token must be rejected.
let r = await rest("POST", "/modules", { body: moduleRow });
check("modules INSERT without x-event-token is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 2. Registration with the token succeeds (retried while PostgREST's pool
//    picks up the private.event_config token).
r = await withRetry(
  () => rest("POST", "/modules", { token: TOKEN, body: moduleRow }),
  (x) => x.status === 201,
);
check("modules INSERT with x-event-token succeeds", r.status === 201, `${r.status} ${r.body}`);

// 3. Heartbeat-style update with the token succeeds.
r = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, {
  token: TOKEN,
  body: { last_seen: new Date().toISOString() },
});
check("modules heartbeat UPDATE with token succeeds", r.status === 200, `${r.status} ${r.body}`);

// 4. Signal insert with the token succeeds.
r = await rest("POST", "/signals", { token: TOKEN, body: signalPayload() });
check("signals INSERT with x-event-token succeeds", r.status === 201, `${r.status} ${r.body}`);
let signalId;
try {
  signalId = JSON.parse(r.body)[0].id;
} catch {
  /* leave undefined — the triage checks below will surface the failure */
}

// 5. Signal insert without the token is rejected.
r = await rest("POST", "/signals", { body: signalPayload() });
check("signals INSERT without x-event-token is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 6. Signal insert with a wrong token is rejected.
r = await rest("POST", "/signals", { token: `wrong-${TOKEN}`, body: signalPayload() });
check("signals INSERT with a wrong token is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 7. Length guardrail: title > 200 chars is rejected even with the token.
r = await rest("POST", "/signals", {
  token: TOKEN,
  body: signalPayload({ title: "x".repeat(201) }),
});
check("signals INSERT with title > 200 chars is rejected", r.status >= 400, `${r.status} ${r.body}`);

// ── Triage UPDATE: room-gated exactly like every other write. ────────────────
// An authenticated session is required: anon is blocked by the column grant,
// service role bypasses RLS — only `authenticated` exercises the token gate.
const userJwt = await authToken();
check("minted an authenticated session for triage checks", Boolean(userJwt), "no access_token from GoTrue");

// 7a. Authenticated triage WITHOUT the token changes nothing. RLS `using()` is
//     false, so PostgREST returns 200 with an EMPTY representation (0 rows) —
//     not a 4xx. Accept either shape as "denied".
r = await rest("PATCH", `/signals?id=eq.${signalId}`, {
  bearer: userJwt,
  body: { verification: "verified" },
});
let noTokenDenied = r.status >= 400;
if (!noTokenDenied) {
  try {
    noTokenDenied = JSON.parse(r.body).length === 0;
  } catch {
    /* non-array body → treat as not-denied so the check fails loudly */
  }
}
check("authenticated triage UPDATE WITHOUT token is denied (0 rows)", noTokenDenied, `${r.status} ${r.body}`);

// 7b. Authenticated triage WITH the token updates exactly the one row.
r = await rest("PATCH", `/signals?id=eq.${signalId}`, {
  bearer: userJwt,
  token: TOKEN,
  body: { verification: "verified" },
});
let triaged = false;
try {
  const rows = JSON.parse(r.body);
  triaged = r.status === 200 && rows.length === 1 && rows[0].verification === "verified";
} catch {
  /* triaged stays false */
}
check("authenticated triage UPDATE WITH token succeeds", triaged, `${r.status} ${r.body}`);

// ── Storage: same event-token gate + enabled-module prefix as signals. ───────
// 7c. Upload under the enabled module prefix WITH the token succeeds. Storage
//     runs its own DB pool that the PostgREST checks never warmed, so retry
//     while the private.event_config token propagates.
r = await withRetry(
  () => storageUpload(`media/${MODULE_ID}/with-token-${Date.now()}.txt`, { token: TOKEN }),
  (x) => x.status >= 200 && x.status < 300,
);
check("storage upload under enabled prefix WITH token succeeds", r.status >= 200 && r.status < 300, `${r.status} ${r.body}`);

// 7d. Upload WITHOUT the token is rejected.
r = await storageUpload(`media/${MODULE_ID}/no-token-${Date.now()}.txt`);
check("storage upload WITHOUT token is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 8. The kill-switch column is untouchable by clients, token or not.
r = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, { token: TOKEN, body: { enabled: false } });
check("client cannot flip modules.enabled (service-role-only)", r.status >= 400, `${r.status} ${r.body}`);

// 9. The service role CAN flip it — this is the organiser kill-switch.
r = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, { key: SERVICE_KEY, body: { enabled: false } });
let disabledOk = false;
try {
  const rows = JSON.parse(r.body);
  disabledOk = r.status === 200 && rows.length === 1 && rows[0].enabled === false;
} catch {
  /* fall through — disabledOk stays false */
}
check("service role can set enabled=false (kill-switch)", disabledOk, `${r.status} ${r.body}`);

// 10. A disabled module's inserts are silenced, not just its tile.
r = await rest("POST", "/signals", { token: TOKEN, body: signalPayload() });
check("signals INSERT for a DISABLED module is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 10a. The kill-switch also silences a disabled module's uploads.
r = await storageUpload(`media/${MODULE_ID}/after-disable-${Date.now()}.txt`, { token: TOKEN });
check("storage upload for a DISABLED module is rejected", r.status >= 400, `${r.status} ${r.body}`);

// 11. Reads need no token — the feed is public by design.
r = await rest("GET", "/signals?select=id&limit=1");
check("anon SELECT on signals needs no token", r.status === 200, `${r.status} ${r.body}`);

if (failed > 0) {
  console.error(`\n${failed} RLS assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll RLS assertions passed.");
