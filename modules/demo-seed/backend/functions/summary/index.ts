// demo-seed edge function — a per-module Supabase Edge Function (Deno).
//
// Deployed by an organiser as "demo-seed-summary" via
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
// Local dev:  npx supabase functions serve --env-file .env
//             curl http://localhost:54321/functions/v1/demo-seed-summary

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_ANON_KEY")!;
  const rest = `${url}/rest/v1/signals?module_id=eq.demo-seed`;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  // Exact row count (PostgREST returns it in Content-Range with count=exact),
  // independent of the page-size cap on the rows below.
  const head = await fetch(`${rest}&select=id`, {
    method: "HEAD",
    headers: { ...auth, Prefer: "count=exact" },
  });
  const total = Number(head.headers.get("content-range")?.split("/")[1] ?? 0);

  // Severity breakdown over a page of rows (a sample when total exceeds the cap —
  // a real aggregation would use an RPC; kept simple here on purpose).
  const rows: { severity: string }[] = await fetch(`${rest}&select=severity`, {
    headers: auth,
  }).then((r) => r.json());
  const sampleBySeverity: Record<string, number> = {};
  for (const r of rows) sampleBySeverity[r.severity] = (sampleBySeverity[r.severity] ?? 0) + 1;

  return new Response(
    JSON.stringify(
      { module: "demo-seed", total, sampled: rows.length, sampleBySeverity },
      null,
      2,
    ),
    { headers: { "content-type": "application/json" } },
  );
});
