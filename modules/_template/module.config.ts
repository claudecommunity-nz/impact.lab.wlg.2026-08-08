import { defineModule } from "@wcc-impact/plugin-sdk";

/**
 * THE manifest (PLAN §4.2, CONTRACTS §8). `pnpm gen` discovers this file and the
 * dashboard renders your tile, page, and home stat from it. `id` must equal the
 * folder name — it is the module_id on your signals and your storage prefix.
 *
 * @example after scaffolding, tune it like:
 *   id: "team-outage-watch", name: "Outage Watch", icon: "radio-tower",
 *   homeStat: { label: "Outages tracked", signalType: "outage" }
 */
export default defineModule({
  contractVersion: 1, // pinned; migrate explicitly when a future contract requires it
  id: "__MODULE_ID__", // = folder name (pnpm new-module fills this in — don't change it)
  name: "__MODULE_NAME__",
  icon: "box",
  description:
    "Hello module scaffolded from _template — replace with what your module actually does (max 300 chars).",
  ui: () => import("./ui"), // omit for data-only modules (you still get a generated page)
  // OPTIONAL — your team's number on the shared home dashboard (big screen):
  // one live stat tile counting your signals (optionally one signal_type only).
  // homeStat: { label: "Hellos tracked", signalType: "hello" },

  // OPTIONAL — reusable widget bodies people can place on /dashboard.
  // The dashboard owns the Card/header/actions/drag/resize UI; your component
  // renders body content only and imports WidgetContent etc. from the SDK.
  // widgets: [
  //   {
  //     id: "hello-summary",
  //     name: "Hello summary",
  //     description: "A compact live count of hello signals.",
  //     ui: () => import("./widgets/hello-summary"),
  //     defaultSize: { w: 3, h: 2 },
  //     minSize: { w: 2, h: 2 },
  //     maxSize: { w: 6, h: 4 },
  //   },
  // ],
  // OPTIONAL — own Postgres tables (see backend/schema.sql). List their logical
  // names here so the dashboard subscribes them on the shared realtime channel;
  // read with useModuleTable(id, name). The physical table is public.m_<id>_<name>.
  // tables: ["notes"],
});
