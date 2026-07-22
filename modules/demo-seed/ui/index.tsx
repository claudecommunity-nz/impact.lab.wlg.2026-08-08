"use client";

import { useMemo, type ReactNode } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useSignals,
} from "@wcc-impact/plugin-sdk";

const MODULE_ID = "demo-seed";

/**
 * demo-seed page — a live, self-documenting tour of the plugin system. Read it
 * as a new team: it shows the whole loop (register → publish → schedule → render)
 * with real code, and proves it works using this module's own seeded scenario.
 */
export default function DemoSeedPage() {
  const { signals } = useSignals({ moduleId: MODULE_ID });

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of signals) m.set(s.signal_type, (m.get(s.signal_type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [signals]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-6">
      {/* Hero */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground">Reference module</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          How the plugin system works
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every team builds a <strong className="text-foreground">module</strong> — a folder with a
          manifest, an optional page like this one, and a Python loader. The loader writes{" "}
          <strong className="text-foreground">signals</strong> into one shared table; the dashboard
          renders them live. This module seeds a full{" "}
          <strong className="text-foreground">M6.5 Wellington earthquake</strong> scenario so the
          picture is alive before anyone else has published, and its page (this page) documents the
          whole system.
        </p>
        <StatRow signals={signals.length} types={byType.length} />
      </header>

      {/* The loop */}
      <section className="flex flex-col gap-4">
        <SectionTitle
          eyebrow="The loop"
          title="Four steps from folder to live dashboard"
          sub="Everything a module does is one of these four. Copy the snippets."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Step
            n={1}
            title="Declare the module"
            file="modules/your-team/module.config.ts"
            body="A manifest gives your module an identity and (optionally) a page. pnpm gen discovers it and the dashboard renders your tile."
            code={`import { defineModule } from "@wcc-impact/plugin-sdk";

export default defineModule({
  id: "team-coast-watch",   // = folder name
  name: "Coast Watch",
  icon: "waves",             // a lucide icon name
  description: "Coastal hazard reports",
  ui: () => import("./ui"),  // optional index page
  pages: [                    // optional extra pages -> sub-nav
    { slug: "map", name: "Map", ui: () => import("./pages/map") },
  ],
});`}
          />
          <Step
            n={2}
            title="Register + publish (Python)"
            file="modules/your-team/loader/src/main.py"
            body="Your loader registers once (the tile appears), then writes signals. publish_signal() validates the payload and attaches the room token for you."
            code={`from wcc_impact import register_module, publish_signal

register_module(id="team-coast-watch", name="Coast Watch",
                icon="waves")

publish_signal(
  module_id="team-coast-watch",
  title="Waves over the road at Owhiro Bay",
  signal_type="coastal-hazard",
  source_type="community",
  severity="severe",
  lat=-41.3455, lng=174.7597,
  place_name="Owhiro Bay",
)`}
          />
          <Step
            n={3}
            title="Schedule the work"
            file="run_every — the platform scheduler"
            body="run_every() polls a source on a fixed interval forever: it heartbeats each cycle (health strip stays green), survives a bad tick, and honours a 5-second floor so one loader can't flood the feed."
            code={`from wcc_impact import run_every

def tick():
    data = fetch_my_source()      # your API/feed
    for item in data:
        publish_signal(**to_signal(item))

run_every(60, tick)   # poll once a minute, forever
# In production these run on Azure Functions / Container Apps.`}
          />
          <Step
            n={4}
            title="Render with the SDK"
            file="modules/your-team/ui/index.tsx"
            body="Your page imports ONLY @wcc-impact/plugin-sdk. useSignals() reads the one shared realtime store; SignalMap/SignalFeed render it. No data layer to wire."
            code={`"use client";
import { useSignals, SignalMap, SignalFeed } from "@wcc-impact/plugin-sdk";

export default function Page() {
  const { signals } = useSignals({ moduleId: "team-coast-watch" });
  return (
    <>
      <SignalMap filter={{ moduleId: "team-coast-watch" }} />
      <SignalFeed signals={signals} limit={20} />
    </>
  );
}`}
          />
        </div>
      </section>

      {/* Capabilities */}
      <section className="flex flex-col gap-4">
        <SectionTitle
          eyebrow="What loaders can do"
          title="The wcc_impact toolkit"
          sub="One import gives you the whole platform. Same names on the TypeScript side."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Cap
            title="publish_signal()"
            desc="Write a validated signal to the shared table — the core write path."
          />
          <Cap
            title="run_every()"
            desc="Schedule a polling loop with heartbeats + a 5s floor."
          />
          <Cap
            title="ask_claude() / analyze_image()"
            desc="Classify text or triage a photo with Claude, on your team's key."
          />
          <Cap
            title="geocode()"
            desc="Wellington place name → lat/lng, gazetteer-first with a fallback."
          />
          <Cap
            title="upload_file()"
            desc="Push a photo to shared storage, scoped to media/<your-module>/."
          />
          <Cap
            title="heartbeat() + register_module()"
            desc="Keep your tile alive and its metadata current."
          />
        </div>
        <Card className="bg-muted/40">
          <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Under the hood:</strong> loaders (Python) write to
              a Supabase <code className="rounded bg-background px-1 py-0.5 text-xs">signals</code>{" "}
              table gated by a room-only token; the dashboard holds{" "}
              <strong className="text-foreground">one</strong> realtime subscription and fans it out
              via <code className="rounded bg-background px-1 py-0.5 text-xs">useSignals()</code>.
              Organisers can flip a module off instantly with the kill-switch — no redeploy.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Live proof — lives on the sub-page, to demonstrate module sub-navigation */}
      <section className="flex flex-col gap-4">
        <SectionTitle
          eyebrow="This module, live"
          title="The earthquake scenario it seeded"
          sub="This module has a sub-navigation (see the tabs above / the sidebar). The full live map, feed, and breakdown are on the Live scenario page."
        />
        <a
          href={`/modules/${MODULE_ID}/scenario`}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm transition-colors hover:bg-accent"
        >
          <span className="font-medium text-foreground">
            Open the Live scenario page — {byType.length} signal types on the shared map & feed
          </span>
          <span className="text-primary">→</span>
        </a>
      </section>
    </div>
  );
}

function StatRow({ signals, types }: { signals: number; types: number }) {
  const items = [
    { label: "Signals on the dashboard", value: signals },
    { label: "Signal types", value: types },
    { label: "Scenario", value: "M6.5" },
    { label: "Sources", value: "news · sensors · official · community" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <Card key={i.label} className="gap-0 py-3">
          <CardContent className="flex flex-col gap-0.5 px-4">
            <span className="text-lg font-semibold tabular-nums text-foreground">{i.value}</span>
            <span className="text-[11px] text-muted-foreground">{i.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wider text-primary uppercase">{eyebrow}</span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Step({
  n,
  title,
  file,
  body,
  code,
}: {
  n: number;
  title: string;
  file: string;
  body: string;
  code: string;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="gap-1 border-b border-border bg-muted/30 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex size-5 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
            {n}
          </span>
          {title}
        </CardTitle>
        <CardDescription className="font-mono text-[11px]">{file}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
        <CodeBlock>{code}</CodeBlock>
      </CardContent>
    </Card>
  );
}

function Cap({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <code className="text-xs font-semibold text-foreground">{title}</code>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-[11px] leading-relaxed">
      <code className="font-mono text-foreground">{children}</code>
    </pre>
  );
}
