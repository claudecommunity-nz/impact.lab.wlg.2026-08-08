/**
 * The dashboard uses the SDK's Supabase browser client — ONE client (and ONE
 * realtime channel, owned by SignalProvider) for the whole app (CONTRACTS §4).
 * This re-export exists so core dashboard code has a stable local import path;
 * never create a second client here.
 *
 * @example
 * import { getSupabase } from "../lib/supabase";
 * const { data } = await getSupabase().from("modules").select("*");
 */
export { getSupabase } from "@wcc-impact/plugin-sdk/client";
