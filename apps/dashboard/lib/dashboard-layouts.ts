import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import {
  sanitizeDashboardLayout,
  type DashboardLayoutDocument,
  type RegisteredWidget,
} from "./widgets";

export interface RemoteDashboardLayout {
  document: DashboardLayoutDocument;
  revision: number;
}

/** Load the user's one personal layout. Does not create a realtime channel. */
export async function loadPersonalDashboardLayout(
  user: User,
  definitions: readonly RegisteredWidget[],
): Promise<RemoteDashboardLayout | null> {
  const { data, error } = await getSupabase()
    .from("dashboard_layouts")
    .select("document, revision")
    .eq("owner_id", user.id)
    .eq("scope", "personal")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const document = sanitizeDashboardLayout(data.document, definitions);
  return document
    ? { document, revision: Number(data.revision) || 1 }
    : null;
}

/** Upsert the user's personal layout. RLS requires owner_id = auth.uid(). */
export async function savePersonalDashboardLayout(
  user: User,
  document: DashboardLayoutDocument,
): Promise<number> {
  const { data, error } = await getSupabase()
    .from("dashboard_layouts")
    .upsert(
      {
        owner_id: user.id,
        scope: "personal",
        slug: null,
        name: "My dashboard",
        schema_version: document.version,
        document,
      },
      { onConflict: "owner_id" },
    )
    .select("revision")
    .single();
  if (error) throw error;
  return Number(data.revision) || 1;
}
