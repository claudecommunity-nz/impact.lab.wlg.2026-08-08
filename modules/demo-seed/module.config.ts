import { defineModule } from "@wcc-impact/plugin-sdk";

/**
 * demo-seed — the organiser's reference module. It does two jobs:
 *  1. Seeds a full Wellington earthquake scenario (~5,000 signals) so the shared
 *     dashboard tells a real story before any team has published.
 *  2. Its page (ui/index.tsx) is a live, self-documenting tour of the plugin
 *     system — how a module registers, writes signals, schedules work, and uses
 *     the SDK. New teams read this to learn the platform.
 */
export default defineModule({
  contractVersion: 1,
  id: "demo-seed",
  name: "Demo · Wellington Quake",
  icon: "siren",
  description:
    "Reference module: seeds the M6.5 Wellington earthquake scenario and demonstrates how the plugin system works.",
  ui: () => import("./ui"),
  // Extra pages become a sub-navigation under the module's tile — this is how a
  // module can be more than a single page.
  pages: [
    { slug: "scenario", name: "Live scenario", ui: () => import("./pages/scenario") },
  ],
  // This module owns a Postgres table beyond `signals` — public.m_demo_seed_pins,
  // defined in backend/schema.sql. Declaring it here makes useModuleTable() live
  // via the shared realtime channel. (Also has an edge function, backend/
  // functions/summary — functions aren't declared here; they deploy by folder.)
  tables: ["pins"],
  homeStat: { label: "Scenario signals" },
});
