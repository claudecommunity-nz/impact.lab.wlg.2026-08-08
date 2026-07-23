import type {
  SupabaseActivity,
  SupabaseMediaActivity,
  SupabaseModuleActivity,
  SupabaseSignalActivity,
  SupabaseTableActivity,
} from "./types";

type UnknownRecord = Record<string, unknown>;

export interface SupabaseSnapshotInput {
  modules?: UnknownRecord[];
  moduleContractVersions?: Record<string, number>;
  recentSignals?: UnknownRecord[];
  signalCount?: number | null;
  moduleSignalCounts?: Record<string, number | null>;
  declaredTables?: Array<{
    moduleId: string;
    logicalName: string;
    physicalName: string;
    count: number | null;
    rows: UnknownRecord[];
    error?: string;
  }>;
  media?: Array<{
    moduleId: string;
    name: string;
    createdAt: string | null;
    size: number | null;
    mimeType: string | null;
    publicUrl: string;
  }>;
  errors?: string[];
  unavailable?: boolean;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function redactKey(key: string): boolean {
  return /(?:token|secret|password|private[_-]?key|api[_-]?key)/i.test(key);
}

/** Bound public previews and defensively redact secret-shaped fields. */
export function sanitizePublicRow(
  value: unknown,
  depth = 0,
): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 499)}…` : value;
  if (depth >= 3) return "[nested value]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizePublicRow(item, depth + 1));
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value as UnknownRecord)
      .slice(0, 40)
      .map(([key, item]) => [
        key,
        redactKey(key) ? "[redacted]" : sanitizePublicRow(item, depth + 1),
      ]),
  );
}

export function buildSupabaseActivity(
  input: SupabaseSnapshotInput,
  fetchedAt = new Date().toISOString(),
): SupabaseActivity {
  const errors = input.errors ?? [];
  const source = {
    source: "supabase" as const,
    status: input.unavailable ? ("unavailable" as const) : errors.length ? ("degraded" as const) : ("ok" as const),
    fetchedAt,
    ...(errors.length ? { message: errors.join(" · ") } : {}),
  };

  const declaredByModule = new Map<string, string[]>();
  for (const table of input.declaredTables ?? []) {
    const names = declaredByModule.get(table.moduleId) ?? [];
    names.push(table.logicalName);
    declaredByModule.set(table.moduleId, names);
  }

  const modules: SupabaseModuleActivity[] = (input.modules ?? []).map((row) => ({
    id: string(row.id),
    name: string(row.name, string(row.id)),
    icon: nullableString(row.icon),
    description: nullableString(row.description),
    contractVersion: input.moduleContractVersions?.[string(row.id)] ?? null,
    enabled: row.enabled === true,
    lastSeen: nullableString(row.last_seen),
    updatedAt: string(row.updated_at),
    signalCount: input.moduleSignalCounts?.[string(row.id)] ?? null,
    declaredTables: declaredByModule.get(string(row.id)) ?? [],
    queueDepth: nonNegativeInteger(row.queue_depth),
    queueOldestAt: nullableString(row.queue_oldest_at),
    queueLastSuccessAt: nullableString(row.queue_last_success_at),
    queueLastError: nullableString(row.queue_last_error),
    queueDeadLetters: nonNegativeInteger(row.queue_dead_letters),
    queueUpdatedAt: nullableString(row.queue_updated_at),
  }));

  const recentSignals: SupabaseSignalActivity[] = (input.recentSignals ?? []).map((row) => ({
    id: string(row.id),
    createdAt: string(row.created_at),
    title: string(row.title, "(untitled signal)"),
    signalType: string(row.signal_type),
    moduleId: string(row.module_id),
    sourceType: string(row.source_type),
    severity: string(row.severity, "unknown"),
    verification: string(row.verification, "unverified"),
  }));

  const tables: SupabaseTableActivity[] = (input.declaredTables ?? []).map((table) => ({
    moduleId: table.moduleId,
    logicalName: table.logicalName,
    physicalName: table.physicalName,
    count: table.count,
    rows: table.rows.map((row) => sanitizePublicRow(row) as UnknownRecord),
    ...(table.error ? { error: table.error } : {}),
  }));

  const recentMedia: SupabaseMediaActivity[] = (input.media ?? []).map((item) => ({ ...item }));

  return {
    source,
    totals: {
      registeredModules: modules.length,
      enabledModules: modules.filter((module) => module.enabled).length,
      signals: input.signalCount ?? null,
      declaredTables: tables.length,
      previewedMedia: recentMedia.length,
    },
    modules,
    recentSignals,
    tables,
    recentMedia,
  };
}
