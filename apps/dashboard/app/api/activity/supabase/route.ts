import { createClient } from "@supabase/supabase-js";
import { moduleTableName } from "@wcc-impact/shared";
import { NextResponse } from "next/server";

import registry from "../../../../registry.gen";
import { buildSupabaseActivity } from "../../../../lib/activity/supabase";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=15, stale-while-revalidate=60";
const RECENT_SIGNAL_LIMIT = 50;
const TABLE_PREVIEW_LIMIT = 8;
const MEDIA_PREVIEW_LIMIT = 12;

function response(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: { "Cache-Control": CACHE_CONTROL } });
}

function errorMessage(prefix: string, error: { message: string } | null): string | null {
  return error ? `${prefix}: ${error.message}` : null;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return response(
      buildSupabaseActivity({
        unavailable: true,
        errors: ["Supabase public URL or publishable key is not configured."],
      }),
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const errors: string[] = [];

  try {
    const [modulesResult, signalsResult, signalCountResult] = await Promise.all([
      supabase.from("modules").select("*").order("id"),
      supabase
        .from("signals")
        .select(
          "id,created_at,title,signal_type,module_id,source_type,severity,verification",
        )
        .order("created_at", { ascending: false })
        .limit(RECENT_SIGNAL_LIMIT),
      supabase.from("signals").select("*", { count: "exact", head: true }),
    ]);

    const modulesError = errorMessage("modules", modulesResult.error);
    const signalsError = errorMessage("recent signals", signalsResult.error);
    const countError = errorMessage("signal count", signalCountResult.error);
    if (modulesError) errors.push(modulesError);
    if (signalsError) errors.push(signalsError);
    if (countError) errors.push(countError);

    const modules = (modulesResult.data ?? []) as Array<Record<string, unknown>>;
    const moduleSignalCounts = Object.fromEntries(
      await Promise.all(
        modules.map(async (module) => {
          const id = String(module.id);
          const result = await supabase
            .from("signals")
            .select("*", { count: "exact", head: true })
            .eq("module_id", id);
          if (result.error) errors.push(`signal count for ${id}: ${result.error.message}`);
          return [id, result.error ? null : result.count] as const;
        }),
      ),
    );

    const declaredTables = await Promise.all(
      registry.flatMap((module) =>
        (module.tables ?? []).map(async (logicalName) => {
          const physicalName = moduleTableName(module.id, logicalName);
          const [countResult, orderedRows] = await Promise.all([
            supabase.from(physicalName).select("*", { count: "exact", head: true }),
            supabase
              .from(physicalName)
              .select("*")
              .order("created_at", { ascending: false })
              .limit(TABLE_PREVIEW_LIMIT),
          ]);
          const rowsResult = orderedRows.error
            ? await supabase.from(physicalName).select("*").limit(TABLE_PREVIEW_LIMIT)
            : orderedRows;
          const tableErrors = [countResult.error?.message, rowsResult.error?.message].filter(
            Boolean,
          );
          if (tableErrors.length) {
            errors.push(`${physicalName}: ${tableErrors.join("; ")}`);
          }
          return {
            moduleId: module.id,
            logicalName,
            physicalName,
            count: countResult.error ? null : countResult.count,
            rows: (rowsResult.data ?? []) as Array<Record<string, unknown>>,
            ...(tableErrors.length ? { error: tableErrors.join("; ") } : {}),
          };
        }),
      ),
    );

    const media = (
      await Promise.all(
        modules.map(async (module) => {
          const moduleId = String(module.id);
          const listed = await supabase.storage.from("media").list(moduleId, {
            limit: MEDIA_PREVIEW_LIMIT,
            sortBy: { column: "created_at", order: "desc" },
          });
          if (listed.error) {
            errors.push(`media for ${moduleId}: ${listed.error.message}`);
            return [];
          }
          return (listed.data ?? [])
            .filter((object) => object.id)
            .map((object) => {
              const path = `${moduleId}/${object.name}`;
              const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
              const metadata = (object.metadata ?? {}) as Record<string, unknown>;
              return {
                moduleId,
                name: object.name,
                createdAt: object.created_at ?? null,
                size: typeof metadata.size === "number" ? metadata.size : null,
                mimeType:
                  typeof metadata.mimetype === "string" ? metadata.mimetype : null,
                publicUrl,
              };
            });
        }),
      )
    ).flat();

    return response(
      buildSupabaseActivity({
        modules,
        recentSignals: (signalsResult.data ?? []) as Array<Record<string, unknown>>,
        signalCount: signalCountResult.error ? null : signalCountResult.count,
        moduleSignalCounts,
        declaredTables,
        media,
        errors,
        unavailable: Boolean(modulesResult.error && signalsResult.error),
      }),
    );
  } catch (error) {
    return response(
      buildSupabaseActivity({
        unavailable: true,
        errors: [
          error instanceof Error ? error.message : "Supabase activity is unavailable",
        ],
      }),
    );
  }
}

