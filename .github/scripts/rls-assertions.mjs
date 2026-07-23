#!/usr/bin/env node
/**
 * Per-module RLS assertions against CI's ephemeral Supabase stack.
 *
 * Proves that loader tokens and authenticated browser claims can write only
 * their own registry row, signals, storage prefix, and module tables; public
 * cross-team reads remain available; kill-switch/revocation/rotation take
 * effect immediately; and legacy room-token writes require an explicit window.
 */

const API = (process.env.SUPABASE_API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
const ANON_KEY = need("SUPABASE_ANON_KEY");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const MODULE_TOKEN = need("CI_MODULE_TOKEN");
const OTHER_TOKEN = need("CI_OTHER_MODULE_TOKEN");
const ROTATED_TOKEN = need("CI_ROTATED_MODULE_TOKEN");
const LEGACY_TOKEN = need("CI_EVENT_TOKEN");
const MODULE_ID = "ci-rls-probe";
const OTHER_MODULE_ID = "demo-seed";

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(2);
  }
  return value;
}

async function rest(
  method,
  path,
  {
    key = ANON_KEY,
    moduleToken,
    legacyToken,
    declaredModuleId,
    body,
    bearer,
  } = {},
) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${bearer ?? key}`,
    Prefer: "return=representation",
  };
  if (moduleToken !== undefined) headers["x-module-token"] = moduleToken;
  if (legacyToken !== undefined) headers["x-event-token"] = legacyToken;
  if (declaredModuleId !== undefined) headers["x-module-id"] = declaredModuleId;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}/rest/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.text() };
}

async function rpc(name, body) {
  return rest("POST", `/rpc/${name}`, {
    key: SERVICE_KEY,
    body,
  });
}

async function authToken(moduleId) {
  const suffix = `${moduleId ?? "unassigned"}-${Date.now()}-${Math.random()}`;
  const email = `ci-rls-${suffix}@example.com`;
  const password = "ci-rls-probe-pw-1234567890";
  const created = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      ...(moduleId ? { app_metadata: { module_id: moduleId } } : {}),
    }),
  });
  if (!created.ok) return undefined;
  const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  try {
    return JSON.parse(await response.text()).access_token;
  } catch {
    return undefined;
  }
}

async function storageUpload(
  objectPath,
  {
    key = ANON_KEY,
    moduleToken,
    legacyToken,
    declaredModuleId,
    bearer,
  } = {},
) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${bearer ?? key}`,
    "Content-Type": "text/plain",
  };
  if (moduleToken !== undefined) headers["x-module-token"] = moduleToken;
  if (legacyToken !== undefined) headers["x-event-token"] = legacyToken;
  if (declaredModuleId !== undefined) headers["x-module-id"] = declaredModuleId;
  const response = await fetch(`${API}/storage/v1/object/${objectPath}`, {
    method: "POST",
    headers,
    body: "ci module-isolation probe",
  });
  return { status: response.status, body: await response.text() };
}

async function withRetry(fn, isOk, attempts = 10, delayMs = 1000) {
  let last;
  for (let index = 0; index < attempts; index++) {
    last = await fn();
    if (isOk(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

function denied(result) {
  if (result.status >= 400) return true;
  try {
    return Array.isArray(JSON.parse(result.body)) && JSON.parse(result.body).length === 0;
  } catch {
    return false;
  }
}

function jwtSubject(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub;
  } catch {
    return undefined;
  }
}

const signalPayload = (moduleId = MODULE_ID, overrides = {}) => ({
  module_id: moduleId,
  title: "CI probe: waves over the road at Owhiro Bay",
  signal_type: "ci-probe",
  source_type: "sensor",
  severity: "unknown",
  ...overrides,
});

const moduleRow = {
  id: MODULE_ID,
  name: "CI RLS Probe",
  icon: "flask-conical",
  description: "Ephemeral CI-only module for RLS assertions.",
};

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  PASS" : "✗ FAIL"}  ${name}`);
  if (!ok) {
    console.log(`         → ${detail}`);
    failed++;
  }
}

// Registration is credential-owned before the public modules row exists.
let result = await rest("POST", "/modules", { body: moduleRow });
check("registration without a module credential is rejected", denied(result), `${result.status} ${result.body}`);

result = await withRetry(
  () => rest("POST", "/modules", { moduleToken: MODULE_TOKEN, body: moduleRow }),
  (value) => value.status === 201,
);
check("module token registers its own module", result.status === 201, `${result.status} ${result.body}`);

result = await rest("POST", "/modules", {
  moduleToken: MODULE_TOKEN,
  body: { ...moduleRow, id: "ci-cross-module" },
});
check("module token cannot register another module id", denied(result), `${result.status} ${result.body}`);

result = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, {
  moduleToken: MODULE_TOKEN,
  body: {
    last_seen: new Date().toISOString(),
    queue_depth: 2,
    queue_oldest_at: new Date().toISOString(),
    queue_last_error: "CI simulated network interruption",
    queue_dead_letters: 0,
    queue_updated_at: new Date().toISOString(),
  },
});
let heartbeatUpdated = false;
try {
  const rows = JSON.parse(result.body);
  heartbeatUpdated = result.status === 200 && rows.length === 1 && rows[0].queue_depth === 2;
} catch {
  // surfaced by assertion
}
check("module token updates its own heartbeat/queue health", heartbeatUpdated, `${result.status} ${result.body}`);

result = await rest("PATCH", `/modules?id=eq.${OTHER_MODULE_ID}`, {
  moduleToken: MODULE_TOKEN,
  body: { last_seen: new Date().toISOString() },
});
check("module token cannot heartbeat another module", denied(result), `${result.status} ${result.body}`);

// Signals are owned, durable replay remains unique, and public reads remain.
const idempotencyKey = `ci-replay-${Date.now()}`;
result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(MODULE_ID, {
    idempotency_key: idempotencyKey,
    observed_at: new Date().toISOString(),
    lat: -41.2865,
    lng: 174.7762,
    severity: "severe",
    source: "CI sensor one",
    raw: { location_precision: "exact", location_accuracy_m: 20 },
  }),
});
check("module token inserts its own signal", result.status === 201, `${result.status} ${result.body}`);
let signalId;
try {
  signalId = JSON.parse(result.body)[0].id;
} catch {
  // surfaced by triage assertions
}

result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(OTHER_MODULE_ID),
});
check("module token cannot insert another module's signal", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/signals", {
  moduleToken: `wrong-${MODULE_TOKEN}`,
  body: signalPayload(),
});
check("unknown module token is rejected", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(MODULE_ID, { title: "x".repeat(201) }),
});
check("signal length guardrail still applies", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(MODULE_ID, {
    idempotency_key: idempotencyKey,
    title: "replay must not duplicate",
  }),
});
check("duplicate module/idempotency key is rejected", result.status === 409, `${result.status} ${result.body}`);

result = await rest("GET", `/signals?select=id&module_id=eq.${MODULE_ID}`);
check("cross-team anonymous signal reads remain public", result.status === 200, `${result.status} ${result.body}`);

result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(MODULE_ID, {
    idempotency_key: `ci-spatial-neighbour-${Date.now()}`,
    observed_at: new Date().toISOString(),
    lat: -41.2868,
    lng: 174.7765,
    severity: "moderate",
    source: "CI sensor two",
    raw: { location_precision: "exact", location_accuracy_m: 25 },
  }),
});
check("module inserts independently sourced nearby evidence", result.status === 201, `${result.status} ${result.body}`);

// Browser JWT claims are organiser-assigned and module-scoped.
const ownUserJwt = await authToken(MODULE_ID);
const otherUserJwt = await authToken(OTHER_MODULE_ID);
const unassignedUserJwt = await authToken(null);
check("minted authenticated module sessions", Boolean(ownUserJwt && otherUserJwt && unassignedUserJwt));

// Dashboard layouts are user preferences, completely separate from module
// ownership. Owners can sync one personal JSON document; shared presets remain
// service-role authored and publicly readable.
const ownUserId = jwtSubject(ownUserJwt);
const otherUserId = jwtSubject(otherUserJwt);
const layoutDocument = { version: 1, widgets: [] };

result = await rest("POST", "/rpc/rotate_module_credential", {
  bearer: unassignedUserJwt,
  body: {
    target_module_id: OTHER_MODULE_ID,
    plaintext_token: "browser-must-not-rotate-this-token",
  },
});
check("authenticated users cannot call organiser credential controls", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/rpc/response_access", {
  bearer: unassignedUserJwt,
  body: {},
});
check(
  "ordinary authenticated users have no operations access",
  result.status === 200 && JSON.parse(result.body).authorized === false,
  `${result.status} ${result.body}`,
);

result = await rpc("set_response_member", {
  target_user_id: ownUserId,
  target_role: "operator",
});
check(
  "service role assigns response membership",
  result.status === 204 || result.status === 200,
  `${result.status} ${result.body}`,
);

result = await rest("POST", "/rpc/response_access", {
  bearer: ownUserJwt,
  body: {},
});
check(
  "assigned response operator receives operations access",
  result.status === 200 &&
    JSON.parse(result.body).authorized === true &&
    JSON.parse(result.body).role === "operator",
  `${result.status} ${result.body}`,
);

result = await rest("POST", "/rpc/signal_triage_queue", {
  bearer: unassignedUserJwt,
  body: { p_window_hours: 24, p_limit: 20 },
});
check("unassigned user cannot read cross-module triage", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/rpc/signal_triage_queue", {
  bearer: ownUserJwt,
  body: { p_window_hours: 24, p_limit: 20 },
});
let queueContainsSignal = false;
try {
  queueContainsSignal =
    result.status === 200 &&
    JSON.parse(result.body).some((candidate) => candidate.id === signalId);
} catch {
  // surfaced by assertion
}
check("operator reads the spatially ranked cross-module queue", queueContainsSignal, `${result.status} ${result.body}`);

result = await rest("POST", "/rpc/signals_nearby", {
  body: {
    p_lat: -41.2865,
    p_lng: 174.7762,
    p_radius_m: 500,
    p_since: new Date(Date.now() - 60_000).toISOString(),
    p_limit: 20,
  },
});
check(
  "anonymous radius query returns nearby public evidence",
  result.status === 200 && JSON.parse(result.body).length >= 2,
  `${result.status} ${result.body}`,
);

result = await rest("POST", "/rpc/signal_hotspots", {
  body: {
    p_since: new Date(Date.now() - 60_000).toISOString(),
    p_eps_m: 500,
    p_minpoints: 2,
    p_limit: 20,
  },
});
check(
  "PostGIS clusters nearby same-type evidence into a hotspot",
  result.status === 200 &&
    JSON.parse(result.body).some((hotspot) => hotspot.signal_count >= 2),
  `${result.status} ${result.body}`,
);

result = await rest("POST", "/rpc/create_incident_from_signal", {
  bearer: ownUserJwt,
  body: { p_signal_id: signalId },
});
let incidentId;
try {
  incidentId = JSON.parse(result.body);
} catch {
  // surfaced by assertion
}
check("operator promotes evidence into an incident", result.status === 200 && incidentId, `${result.status} ${result.body}`);

result = await rest("PATCH", `/incidents?id=eq.${incidentId}`, {
  bearer: ownUserJwt,
  body: { status: "active" },
});
check("operators cannot bypass assessment history with direct writes", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/rpc/assess_incident", {
  bearer: ownUserJwt,
  body: {
    p_incident_id: incidentId,
    p_status: "active",
    p_action_priority: "p2",
    p_verification_priority: "p1",
    p_reason_codes: ["high_consequence", "independent_corroboration"],
    p_note: "CI assessment",
  },
});
check("operator assessment updates the incident through the audited RPC", result.status === 200, `${result.status} ${result.body}`);

result = await rest("POST", "/rpc/signal_triage_queue", {
  bearer: ownUserJwt,
  body: { p_window_hours: 24, p_limit: 20 },
});
let promotedEvidenceRemoved = false;
try {
  promotedEvidenceRemoved =
    result.status === 200 &&
    !JSON.parse(result.body).some((candidate) => candidate.id === signalId);
} catch {
  // surfaced by assertion
}
check("promoted evidence leaves the new-incident queue", promotedEvidenceRemoved, `${result.status} ${result.body}`);

result = await rest("POST", "/dashboard_layouts", {
  bearer: ownUserJwt,
  body: {
    owner_id: ownUserId,
    scope: "personal",
    name: "CI personal dashboard",
    schema_version: 1,
    document: layoutDocument,
  },
});
let personalLayoutId;
try {
  personalLayoutId = JSON.parse(result.body)[0].id;
} catch {
  // surfaced by assertions
}
check("authenticated user creates their personal dashboard", result.status === 201 && personalLayoutId, `${result.status} ${result.body}`);

result = await rest("GET", `/dashboard_layouts?id=eq.${personalLayoutId}`);
check("anonymous users cannot read a personal dashboard", result.status === 200 && JSON.parse(result.body).length === 0, `${result.status} ${result.body}`);

result = await rest("GET", `/dashboard_layouts?id=eq.${personalLayoutId}`, {
  bearer: otherUserJwt,
});
check("another user cannot read a personal dashboard", result.status === 200 && JSON.parse(result.body).length === 0, `${result.status} ${result.body}`);

result = await rest("PATCH", `/dashboard_layouts?id=eq.${personalLayoutId}`, {
  bearer: otherUserJwt,
  body: { name: "stolen dashboard", owner_id: otherUserId },
});
check("another user cannot mutate a personal dashboard", denied(result), `${result.status} ${result.body}`);

result = await rest("PATCH", `/dashboard_layouts?id=eq.${personalLayoutId}`, {
  bearer: ownUserJwt,
  body: { name: "updated personal dashboard" },
});
check("the owner updates their personal dashboard", result.status === 200 && JSON.parse(result.body).length === 1, `${result.status} ${result.body}`);

result = await rest("POST", "/dashboard_layouts", {
  bearer: ownUserJwt,
  body: {
    owner_id: null,
    scope: "shared",
    slug: `user-shared-${Date.now()}`,
    name: "Not allowed",
    schema_version: 1,
    document: layoutDocument,
  },
});
check("ordinary authenticated users cannot create shared dashboards", denied(result), `${result.status} ${result.body}`);

const sharedSlug = `ci-shared-${Date.now()}`;
result = await rest("POST", "/dashboard_layouts", {
  key: SERVICE_KEY,
  body: {
    owner_id: null,
    scope: "shared",
    slug: sharedSlug,
    name: "CI shared preset",
    schema_version: 1,
    document: layoutDocument,
  },
});
check("service role creates a shared dashboard preset", result.status === 201, `${result.status} ${result.body}`);

result = await rest("GET", `/dashboard_layouts?slug=eq.${sharedSlug}`);
check("anonymous users can read shared dashboard presets", result.status === 200 && JSON.parse(result.body).length === 1, `${result.status} ${result.body}`);

result = await rest("POST", "/dashboard_layouts", {
  key: SERVICE_KEY,
  body: {
    owner_id: null,
    scope: "shared",
    slug: `too-many-${Date.now()}`,
    name: "Too many widgets",
    schema_version: 1,
    document: {
      version: 1,
      widgets: Array.from({ length: 101 }, (_, index) => ({ instanceId: String(index) })),
    },
  },
});
check("database rejects dashboard documents over 100 widgets", result.status >= 400, `${result.status} ${result.body}`);

result = await rest("POST", "/dashboard_layouts", {
  key: SERVICE_KEY,
  body: {
    owner_id: null,
    scope: "shared",
    slug: `malformed-${Date.now()}`,
    name: "Malformed document",
    schema_version: 1,
    document: { version: 1 },
  },
});
check("database requires a widget array in every dashboard document", result.status >= 400, `${result.status} ${result.body}`);

result = await rest("POST", "/dashboard_layouts", {
  key: SERVICE_KEY,
  body: {
    owner_id: null,
    scope: "shared",
    slug: `oversized-${Date.now()}`,
    name: "Oversized document",
    schema_version: 1,
    document: { version: 1, widgets: [], padding: "x".repeat(70_000) },
  },
});
check("database rejects dashboard documents over 64 KiB", result.status >= 400, `${result.status} ${result.body}`);

result = await rest("PATCH", `/signals?id=eq.${signalId}`, {
  bearer: ownUserJwt,
  body: { verification: "verified" },
});
let triaged = false;
try {
  const rows = JSON.parse(result.body);
  triaged = result.status === 200 && rows.length === 1 && rows[0].verification === "verified";
} catch {
  // surfaced by assertion
}
check("assigned browser user triages its own signal without a module secret", triaged, `${result.status} ${result.body}`);

result = await rest("PATCH", `/signals?id=eq.${signalId}`, {
  bearer: otherUserJwt,
  body: { verification: "corroborated" },
});
check("browser user cannot triage another module's signal", denied(result), `${result.status} ${result.body}`);

result = await rest("PATCH", `/signals?id=eq.${signalId}`, {
  bearer: unassignedUserJwt,
  body: { verification: "corroborated" },
});
check("unassigned browser user remains read-only", denied(result), `${result.status} ${result.body}`);

// Storage prefix and custom tables use the same ownership predicate.
result = await storageUpload(`media/${MODULE_ID}/own-${Date.now()}.txt`, {
  moduleToken: MODULE_TOKEN,
});
check("module token uploads under its own media prefix", result.status >= 200 && result.status < 300, `${result.status} ${result.body}`);

result = await storageUpload(`media/${OTHER_MODULE_ID}/cross-${Date.now()}.txt`, {
  moduleToken: MODULE_TOKEN,
});
check("module token cannot upload under another media prefix", denied(result), `${result.status} ${result.body}`);

result = await storageUpload(`media/${MODULE_ID}/browser-${Date.now()}.txt`, {
  bearer: ownUserJwt,
});
check("assigned browser user uploads without a module secret", result.status >= 200 && result.status < 300, `${result.status} ${result.body}`);

const pin = (label) => ({ label, kind: "note" });
result = await rest("POST", "/m_demo_seed_pins", {
  moduleToken: OTHER_TOKEN,
  body: pin(`owned-${Date.now()}`),
});
check("module token writes its owned custom table", result.status === 201, `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  moduleToken: MODULE_TOKEN,
  body: pin(`cross-${Date.now()}`),
});
check("module token cannot write another module's custom table", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  bearer: otherUserJwt,
  body: pin(`browser-${Date.now()}`),
});
check("assigned browser user writes its module table without a secret", result.status === 201, `${result.status} ${result.body}`);

result = await rest("GET", "/m_demo_seed_pins?select=id&limit=1");
check("anonymous cross-team custom-table reads remain public", result.status === 200, `${result.status} ${result.body}`);

// Rotation and revocation take effect without deploying any application.
result = await rpc("rotate_module_credential", {
  target_module_id: OTHER_MODULE_ID,
  plaintext_token: ROTATED_TOKEN,
});
check("service role rotates a module credential", result.status === 204 || result.status === 200, `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  moduleToken: OTHER_TOKEN,
  body: pin(`old-after-rotate-${Date.now()}`),
});
check("old token is invalid immediately after rotation", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  moduleToken: ROTATED_TOKEN,
  body: pin(`new-after-rotate-${Date.now()}`),
});
check("rotated token works without a deploy", result.status === 201, `${result.status} ${result.body}`);

result = await rpc("revoke_module_credential", { target_module_id: OTHER_MODULE_ID });
check("service role revokes a module credential", result.status === 204 || result.status === 200, `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  moduleToken: ROTATED_TOKEN,
  body: pin(`after-revoke-${Date.now()}`),
});
check("revocation immediately blocks loader writes", denied(result), `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  bearer: otherUserJwt,
  body: pin(`browser-after-revoke-${Date.now()}`),
});
check("revocation immediately blocks assigned browser writes", denied(result), `${result.status} ${result.body}`);

// Restore for the migration and read checks that follow.
await rpc("rotate_module_credential", {
  target_module_id: OTHER_MODULE_ID,
  plaintext_token: ROTATED_TOKEN,
});

// Legacy token is off by default, can be opened briefly, and still requires an
// explicit target header. The window is deliberately documented as weaker.
result = await rest("POST", "/m_demo_seed_pins", {
  legacyToken: LEGACY_TOKEN,
  declaredModuleId: OTHER_MODULE_ID,
  body: pin(`legacy-off-${Date.now()}`),
});
check("legacy room token is rejected while migration window is closed", denied(result), `${result.status} ${result.body}`);

result = await rpc("set_legacy_module_write_window", {
  window_end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
});
check("database rejects a legacy window longer than 24 hours", result.status >= 400, `${result.status} ${result.body}`);

result = await rpc("set_legacy_module_write_window", {
  window_end: new Date(Date.now() + 60_000).toISOString(),
});
check("service role opens a bounded legacy window", result.status === 204 || result.status === 200, `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  legacyToken: LEGACY_TOKEN,
  declaredModuleId: OTHER_MODULE_ID,
  body: pin(`legacy-open-${Date.now()}`),
});
check("legacy token works only in an explicit migration window", result.status === 201, `${result.status} ${result.body}`);

result = await rest("POST", "/m_demo_seed_pins", {
  legacyToken: LEGACY_TOKEN,
  declaredModuleId: MODULE_ID,
  body: pin(`legacy-false-claim-${Date.now()}`),
});
check("legacy request cannot write a target different from its declared header", denied(result), `${result.status} ${result.body}`);

await rpc("set_legacy_module_write_window", { window_end: null });

// enabled remains service-role-only and silences every module-scoped surface.
result = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, {
  moduleToken: MODULE_TOKEN,
  body: { enabled: false },
});
check("module credential cannot flip the organiser kill-switch", result.status >= 400, `${result.status} ${result.body}`);

result = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, {
  key: SERVICE_KEY,
  body: { enabled: false },
});
let disabled = false;
try {
  const rows = JSON.parse(result.body);
  disabled = result.status === 200 && rows.length === 1 && rows[0].enabled === false;
} catch {
  // surfaced by assertion
}
check("service role can disable a module", disabled, `${result.status} ${result.body}`);

result = await rest("POST", "/signals", {
  moduleToken: MODULE_TOKEN,
  body: signalPayload(),
});
check("disabled module cannot insert signals", denied(result), `${result.status} ${result.body}`);

result = await storageUpload(`media/${MODULE_ID}/disabled-${Date.now()}.txt`, {
  moduleToken: MODULE_TOKEN,
});
check("disabled module cannot upload media", denied(result), `${result.status} ${result.body}`);

result = await rest("PATCH", `/modules?id=eq.${MODULE_ID}`, {
  moduleToken: MODULE_TOKEN,
  body: { last_seen: new Date().toISOString() },
});
check("disabled module cannot heartbeat", denied(result), `${result.status} ${result.body}`);

if (failed > 0) {
  console.error(`\n${failed} RLS assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll per-module RLS assertions passed.");
