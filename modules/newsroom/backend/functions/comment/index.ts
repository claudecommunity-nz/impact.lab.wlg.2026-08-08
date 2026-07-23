// newsroom-comment — public write endpoint for article comments (Deno edge fn).
//
// The deployed dashboard is read-only (no room token in public JS), so the public
// can't write directly. This function is the sanctioned write path: it validates
// input and writes with the SERVICE ROLE, so anyone can comment + attach an image
// WITHOUT the room token ever leaving the server. It is therefore the ENTIRE
// security boundary for comments — all validation lives here.
//
// A green merge to main deploys this as "newsroom-comment".
// Organiser manual retry: bash scripts/deploy-module-functions.sh newsroom
// Call:    getSupabase().functions.invoke("newsroom-comment", { body })  (from the UI)
//
// POST JSON { article_id, author_name, author_location?, body, image_base64?, image_type? }

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX = { name: 80, location: 120, body: 2000, imageBytes: 2 * 1024 * 1024 };
const RATE_WINDOW_S = 60;
const RATE_MAX = 30; // max comments accepted per rolling minute (crude spam guard)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const article_id = String(payload.article_id ?? "").trim();
  const author_name = String(payload.author_name ?? "").trim();
  const author_location = String(payload.author_location ?? "").trim();
  const body = String(payload.body ?? "").trim();

  // --- validation (this fn is the only gate) ---
  if (!/^[0-9a-f-]{36}$/i.test(article_id)) return json({ error: "article_id must be a uuid" }, 400);
  if (!author_name) return json({ error: "author_name is required" }, 400);
  if (!body) return json({ error: "body is required" }, 400);
  if (author_name.length > MAX.name) return json({ error: `name too long (max ${MAX.name})` }, 400);
  if (author_location.length > MAX.location) return json({ error: `location too long (max ${MAX.location})` }, 400);
  if (body.length > MAX.body) return json({ error: `comment too long (max ${MAX.body})` }, 400);

  // --- rate limit (rolling window, global) ---
  const since = new Date(Date.now() - RATE_WINDOW_S * 1000).toISOString();
  const rl = await fetch(
    `${URL_BASE}/rest/v1/m_newsroom_comments?select=id&created_at=gte.${since}`,
    { headers: { ...svc, Prefer: "count=exact", Range: "0-0" } },
  );
  const recent = Number(rl.headers.get("content-range")?.split("/")[1] ?? 0);
  if (recent >= RATE_MAX) return json({ error: "too many comments right now — try again shortly" }, 429);

  // --- article must exist ---
  const check = await fetch(
    `${URL_BASE}/rest/v1/m_newsroom_articles?id=eq.${article_id}&select=id`,
    { headers: svc },
  );
  if (!((await check.json()) as unknown[]).length) return json({ error: "article not found" }, 404);

  // --- optional image: base64 -> storage (service role), public URL back ---
  let image_url: string | null = null;
  const image_base64 = typeof payload.image_base64 === "string" ? payload.image_base64 : "";
  if (image_base64) {
    const b64 = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
    let bytes: Uint8Array;
    try {
      const bin = atob(b64);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return json({ error: "image_base64 is not valid base64" }, 400);
    }
    if (bytes.byteLength > MAX.imageBytes) return json({ error: "image too large (max 2 MB)" }, 400);
    // Allowlist the content type: this fn writes to the PUBLIC media bucket with
    // the service role, so an attacker-chosen type (text/html, image/svg+xml)
    // would let anyone host scriptable content on the project domain.
    const type = String(payload.image_type ?? "image/jpeg").toLowerCase();
    const IMAGE_TYPES: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = IMAGE_TYPES[type];
    if (!ext) return json({ error: "image_type must be image/jpeg, image/png, image/webp or image/gif" }, 400);
    const key = `newsroom/${crypto.randomUUID()}.${ext}`;
    const up = await fetch(`${URL_BASE}/storage/v1/object/media/${key}`, {
      method: "POST",
      headers: { ...svc, "content-type": type, "x-upsert": "true" },
      body: bytes,
    });
    if (!up.ok) return json({ error: "image upload failed", detail: await up.text() }, 502);
    image_url = `${URL_BASE}/storage/v1/object/public/media/${key}`;
  }

  // --- insert the comment (service role) ---
  const ins = await fetch(`${URL_BASE}/rest/v1/m_newsroom_comments`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      article_id,
      author_name,
      author_location: author_location || null,
      body,
      image_url,
    }),
  });
  if (!ins.ok) return json({ error: "insert failed", detail: await ins.text() }, 502);
  const [comment] = (await ins.json()) as unknown[];
  return json({ comment }, 201);
});
