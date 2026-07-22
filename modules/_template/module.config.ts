import { defineModule } from "@wcc-impact/plugin-sdk";

/**
 * THE manifest (PLAN §4.2, CONTRACTS §8). `pnpm gen` discovers this file and the
 * dashboard renders your tile, page, and map layer from it. `id` must equal the
 * folder name — it is the module_id on your signals and your storage prefix.
 *
 * @example after scaffolding, tune it like:
 *   id: "team-outage-watch", name: "Outage Watch", icon: "radio-tower",
 *   mapLayer: { signalTypes: ["outage"], color: "severity" }
 */
export default defineModule({
  id: "__MODULE_ID__", // = folder name (pnpm new-module fills this in — don't change it)
  name: "__MODULE_NAME__",
  icon: "box",
  description:
    "Hello module scaffolded from _template — replace with what your module actually does (max 300 chars).",
  ui: () => import("./ui"), // omit for data-only modules (you still get a generated page)
  // Plot this module's signals on the SHARED map — uncomment and list your signal types:
  // mapLayer: {
  //   signalTypes: ["hello"], // which of your signal_type values to plot
  //   color: "severity",      // colour by severity, or a fixed design-token colour name
  // },
  // OPTIONAL — own Postgres tables (see backend/schema.sql). List their logical
  // names here so the dashboard subscribes them on the shared realtime channel;
  // read with useModuleTable(id, name). The physical table is public.m_<id>_<name>.
  // tables: ["notes"],
  feedCard: "default", // or a custom component receiving { signal }
});
