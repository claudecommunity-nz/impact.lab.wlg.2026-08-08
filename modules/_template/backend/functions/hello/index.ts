// OPTIONAL — a per-module Supabase Edge Function (Deno), for server-side logic a
// browser or loader shouldn't do: aggregations, webhook receivers, calling a
// third-party API with a secret held in Supabase.
//
// Deploys as  <module-id>-hello  (name-prefixed so teams don't collide) via:
// A green merge to main deploys this automatically. Organiser manual retry:
//   bash scripts/deploy-module-functions.sh <module-id>
// then reachable at  https://<ref>.supabase.co/functions/v1/<module-id>-hello
//
// Local dev (no deploy):
//   npx supabase functions serve --env-file .env
//   curl http://localhost:54321/functions/v1/<module-id>-hello
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// into the runtime — reads are public, so the anon key is enough for most things.
// Delete this whole backend/ folder if your module doesn't need an edge function.

Deno.serve(async (req) => {
  const { name } = Object.fromEntries(new URL(req.url).searchParams);
  return new Response(
    JSON.stringify({ hello: name ?? "world", from: "__MODULE_ID__" }, null, 2),
    { headers: { "content-type": "application/json" } },
  );
});
