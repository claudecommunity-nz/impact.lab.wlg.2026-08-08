import { defineModule } from "@wcc-impact/plugin-sdk";

/**
 * demo-seed remains the organiser's reference-data loader internally, while its
 * participant-facing page is a focused visual guide to the module architecture.
 */
export default defineModule({
  contractVersion: 1,
  id: "demo-seed",
  name: "Module architecture",
  icon: "box",
  description:
    "How module manifests, Python loaders, shared signals, and Plugin SDK interfaces fit together.",
  showRuntimeStatus: false,
  ui: () => import("./ui"),
  widgets: [
    {
      id: "signal-summary",
      name: "Reference data summary",
      description: "Signals published by the bundled reference-data loader.",
      icon: "activity",
      ui: () => import("./widgets/signal-summary"),
      defaultSize: { w: 3, h: 2 },
      minSize: { w: 2, h: 2 },
      maxSize: { w: 6, h: 4 },
      allowMultiple: false,
    },
    {
      id: "signal-watch",
      name: "Signal watch",
      description:
        "Monitor independently configured topics such as fire or power lines.",
      icon: "scan-search",
      ui: () => import("./widgets/signal-watch"),
      defaultSize: { w: 4, h: 3 },
      minSize: { w: 3, h: 2 },
      maxSize: { w: 7, h: 6 },
      allowMultiple: true,
      options: [
        {
          key: "focus",
          label: "Signal focus",
          description:
            "Match words in the signal title, description, type, or location.",
          type: "text",
          defaultValue: "fire",
          placeholder: "fire or power line",
          maxLength: 80,
        },
        {
          key: "minimumSeverity",
          label: "Minimum severity",
          description: "Hide signals below this severity.",
          type: "select",
          choices: [
            { value: "all", label: "Any severity" },
            { value: "moderate", label: "Moderate or higher" },
            { value: "severe", label: "Severe or extreme" },
            { value: "extreme", label: "Extreme only" },
          ],
          defaultValue: "all",
        },
        {
          key: "verifiedOnly",
          label: "Verified only",
          description: "Show only verified or official signals.",
          type: "boolean",
          defaultValue: false,
        },
      ],
    },
  ],
  // This module owns a Postgres table beyond `signals` — public.m_demo_seed_pins,
  // defined in backend/schema.sql. Declaring it here makes useModuleTable() live
  // via the shared realtime channel. (Also has an edge function, backend/
  // functions/summary — functions aren't declared here; they deploy by folder.)
  tables: ["pins"],
  homeStat: { label: "Reference signals" },
});
