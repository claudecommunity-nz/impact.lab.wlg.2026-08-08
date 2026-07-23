// OPTIONAL — a per-module Supabase Edge Function (Deno), for server-side logic a
// browser or loader shouldn't do: aggregations, webhook receivers, calling a
// third-party API with a secret held in Supabase.
//
// Deploys as  <module-id>-hello  (name-prefixed so teams don't collide) via:
// A green merge to main deploys this automatically. Organiser manual retry:
//   bash scripts/deploy-module-functions.sh <module-id>
// then reachable at  https://<ref>.supabase.co/functions/v1/<module-id>-hello
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// into the runtime — reads are public, so the anon key is enough for most things.
// Delete this whole backend/ folder if your module doesn't need an edge function.
//
// This hello endpoint is deliberately public and has no privileged side effects.
// For database writes or private data, authenticate inside the handler and use
// the caller's JWT so RLS remains the authority. Never expose the service-role key.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "GET or POST only" }, 405);
  }

  let name = new URL(req.url).searchParams.get("name");
  if (req.method === "POST") {
    try {
      const payload = (await req.json()) as { name?: unknown };
      if (typeof payload.name === "string") name = payload.name.trim();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
  }

  return json({ hello: name || "world", from: "__MODULE_ID__" });
});
