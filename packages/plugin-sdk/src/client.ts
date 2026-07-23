import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One browser client for the whole app. Browser writes never receive a module
// secret. Supabase Auth supplies a signed JWT, and RLS compares the organiser-
// controlled app_metadata.module_id claim with the target module. Anonymous
// sessions remain public-read and cannot write.
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

  client = createClient(url, key);
  return client;
}
