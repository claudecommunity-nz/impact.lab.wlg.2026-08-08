// demo-seed edge function — a per-module Supabase Edge Function (Deno).
//
// Deployed by an organiser as "demo-seed-summary" via
// A green merge to main deploys this automatically. Organiser manual retry:
//   bash scripts/deploy-module-functions.sh demo-seed
// then reachable at  https://<ref>.supabase.co/functions/v1/demo-seed-summary
//
// Edge Functions run in Supabase's edge runtime (NOT a participant laptop), so
// they're the place for server-side logic a browser shouldn't do: aggregations,
// webhook receivers, calling a third-party API with a secret. This one returns
// a live severity breakdown of the earthquake scenario — computed at the edge,
// close to the data — using the auto-injected SUPABASE_URL + anon key (reads are
// public, so no secret is needed).
//
// This is deliberately a public, read-only example. Module functions are public
// HTTP endpoints unless their handler validates the caller. Never copy this
// access model for service-role writes.

// CORS: browsers call this cross-origin (localhost:3000 / the Vercel dashboard),
// and functions.invoke() sends a preflight — without these headers the function
// is uncallable from any module UI.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...CORS,
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "GET or POST only" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error("demo-seed-summary is missing its Supabase runtime environment");
    return json({ error: "function is not configured" }, 500);
  }

  const rest = `${url}/rest/v1/signals?module_id=eq.demo-seed`;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  // Exact row count (PostgREST returns it in Content-Range with count=exact),
  // independent of the page-size cap on the rows below.
  const [head, rowsResponse] = await Promise.all([
    fetch(`${rest}&select=id`, {
      method: "HEAD",
      headers: { ...auth, Prefer: "count=exact" },
    }),
    fetch(`${rest}&select=severity`, { headers: auth }),
  ]);

  if (!head.ok || !rowsResponse.ok) {
    console.error("demo-seed-summary could not read public signals", {
      countStatus: head.status,
      rowsStatus: rowsResponse.status,
    });
    return json({ error: "signal summary is temporarily unavailable" }, 502);
  }

  // Severity breakdown over a page of rows (a sample when total exceeds the cap —
  // a real aggregation would use an RPC; kept simple here on purpose).
  const total = Number(head.headers.get("content-range")?.split("/")[1] ?? 0);
  const payload: unknown = await rowsResponse.json();
  if (!Array.isArray(payload)) {
    console.error("demo-seed-summary received a non-array signal response");
    return json({ error: "signal summary is temporarily unavailable" }, 502);
  }
  const rows = payload as { severity?: unknown }[];
  const sampleBySeverity: Record<string, number> = {};
  for (const row of rows) {
    if (typeof row.severity !== "string") continue;
    sampleBySeverity[row.severity] = (sampleBySeverity[row.severity] ?? 0) + 1;
  }

  return json({
    module: "demo-seed",
    total,
    sampled: rows.length,
    sampleBySeverity,
    generatedAt: new Date().toISOString(),
  });
});
