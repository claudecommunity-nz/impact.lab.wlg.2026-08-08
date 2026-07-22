import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One browser client for the whole app. createClient attaches the publishable
// key as the `apikey` header; we additionally attach `x-event-token` when the
// env var is present (CONTRACTS.md §3) so every write is room-gated without
// teams ever touching the token in code. When NEXT_PUBLIC_EVENT_TOKEN is
// absent (the deployed public dashboard), the header is omitted entirely and
// the client is read-only in practice — RLS rejects all writes.
let client: SupabaseClient | null = null;

/**
 * The shared Supabase browser client (singleton). Core/dashboard use only —
 * module UIs go through the SDK hooks/components and never need this.
 * Never call `.channel()` on it outside SignalProvider: ONE realtime
 * subscription exists, in the core provider (CONTRACTS.md §4).
 *
 * @example
 * import { getSupabase } from "@wcc-impact/plugin-sdk/client";
 * const { data } = await getSupabase().from("modules").select("*");
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "@wcc-impact/plugin-sdk: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "are not set. Run `cp .env.example .env` in the repo root (both values are prefilled).",
    );
  }

  // Optional by design: absent in the deployed read-only dashboard.
  const token = process.env.NEXT_PUBLIC_EVENT_TOKEN;

  client = createClient(url, key, {
    global: token ? { headers: { "x-event-token": token } } : undefined,
  });
  return client;
}
