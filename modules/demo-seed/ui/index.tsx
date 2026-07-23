"use client";

import type { ReactNode } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ModuleIcon,
} from "@wcc-impact/plugin-sdk";

const FLOW = [
  {
    number: "01",
    icon: "box",
    title: "Declare",
    label: "module.config.ts",
    body: "Give the module a stable identity, describe its UI, and declare any pages, widgets, or owned tables.",
  },
  {
    number: "02",
    icon: "satellite-dish",
    title: "Collect",
    label: "Python loader",
    body: "Fetch or receive source data, normalise it, and keep the module heartbeat current.",
  },
  {
    number: "03",
    icon: "radio-tower",
    title: "Publish",
    label: "signals contract",
    body: "Write validated signals using the module credential. RLS keeps every team inside its own boundary.",
  },
  {
    number: "04",
    icon: "activity",
    title: "Render",
    label: "Plugin SDK",
    body: "The shared provider delivers live data to the map, feed, widgets, and module pages through one connection.",
  },
] as const;

const GOLDEN_PATH = [
  {
    number: "1",
    title: "Create the module",
    command: "pnpm new-module team-<name>",
    note: "Scaffolds the manifest, UI, and Python loader in one team-owned folder.",
  },
  {
    number: "2",
    title: "Add event access",
    command: "cp .env.example .env",
    note: "Ask an organiser for the module token and any optional Supabase or AI keys.",
  },
  {
    number: "3",
    title: "Publish the first signal",
    command:
      "uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main",
    note: "Registers the module, sends its heartbeat, and writes through the shared contract.",
  },
  {
    number: "4",
    title: "Build the interface",
    command: "pnpm dev",
    note: "Open /modules/team-<name>; UI changes refresh while the loader continues separately.",
  },
] as const;

/**
 * A participant-facing visual guide to the platform's module architecture.
 * This page intentionally explains the contract without mixing in seeded
 * scenario data or a second operational dashboard.
 */
export default function ModuleArchitecturePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,0.82fr)_minmax(28rem,1.18fr)]">
          <div className="flex flex-col justify-center gap-5 p-5 sm:p-7 lg:p-9">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Platform guide</Badge>
              <Badge variant="outline">Contract v1</Badge>
            </div>
            <div className="space-y-3">
              <p className="ops-kicker">One folder · one contract · one shared picture</p>
              <h2 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
                Build an independent module that works everywhere.
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Teams own their data collection and interface. The platform owns discovery,
                security, realtime delivery, maps, feeds, health, and deployment.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <HeroFact value="1 folder" label="team-owned boundary" />
              <HeroFact value="1 table" label="shared signal contract" />
              <HeroFact value="1 channel" label="realtime connection" />
            </div>
          </div>
          <div className="relative min-h-72 overflow-hidden border-t border-border bg-[#06182a] lg:min-h-[31rem] lg:border-t-0 lg:border-l">
            <img
              src="/images/module-architecture-hero.png"
              alt="Four connected stages showing a module folder, Python loader, shared signal hub, and emergency dashboard"
              className="absolute inset-0 size-full object-cover"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06182a]/35 via-transparent to-transparent"
              aria-hidden
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="architecture-flow" className="space-y-3">
        <SectionHeading
          eyebrow="The architecture"
          id="architecture-flow"
          title="Four stages, one dependable flow"
          body="A module stays small because the platform handles everything after a validated signal crosses the boundary."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {FLOW.map((stage, index) => (
            <FlowStage key={stage.title} {...stage} final={index === FLOW.length - 1} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <Card className="ops-panel gap-0 overflow-hidden py-0">
          <CardHeader className="ops-panel-header">
            <div>
              <p className="ops-kicker">Inside a module</p>
              <CardTitle className="mt-1 text-lg">A predictable folder, not a new platform</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 py-5 sm:grid-cols-[minmax(12rem,0.72fr)_minmax(0,1.28fr)]">
            <FileTree />
            <div className="space-y-3">
              <Boundary
                icon="box"
                title="Manifest"
                body="Build-time identity and lazy UI declarations. The dashboard discovers it with pnpm gen."
              />
              <Boundary
                icon="radio-tower"
                title="Loader"
                body="A plain Python process with outbound HTTPS. It registers, heartbeats, and publishes."
              />
              <Boundary
                icon="activity"
                title="UI"
                body="React that imports only the Plugin SDK. It consumes the shared store instead of opening channels."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="ops-panel gap-0 overflow-hidden py-0">
          <CardHeader className="ops-panel-header">
            <div>
              <p className="ops-kicker">The shared contract</p>
              <CardTitle className="mt-1 text-lg">Signals connect every team</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 py-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              The <Code>signals</Code> row is the interoperability layer. Publish once and the
              report can appear in every shared surface without another integration.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ContractField label="What" value="title + description" />
              <ContractField label="Where" value="lat/lng + place" />
              <ContractField label="Impact" value="severity" />
              <ContractField label="Trust" value="verification" />
              <ContractField label="Origin" value="source type" />
              <ContractField label="Owner" value="module id" />
            </div>
            <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Result:</strong> one publish updates the common
              map, priority feed, module health, exact aggregates, and any matching widget.
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="module-backends" className="space-y-3">
        <SectionHeading
          eyebrow="Optional Supabase backend"
          id="module-backends"
          title="Own tables and functions without owning infrastructure"
          body="Signals remain the default integration path. When a module genuinely needs more, its schema and server-side logic still live inside the same team folder."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="ops-panel gap-0 overflow-hidden py-0">
            <CardHeader className="ops-panel-header">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ModuleIcon name="box" className="size-4.5" />
                </span>
                <div>
                  <p className="ops-kicker">Postgres tables</p>
                  <CardTitle className="mt-1 text-lg">Declare, secure, then subscribe</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 py-5">
              <BackendStep
                number="1"
                title="Create the owned table"
                body="Put idempotent DDL in backend/schema.sql. Names must use the module prefix."
              />
              <CodePanel>{`create table if not exists
  public.m_team_name_cases (...);

select wcc.enable_module_table(
  'public.m_team_name_cases',
  'team-name'
);`}</CodePanel>
              <BackendStep
                number="2"
                title="Declare its logical name"
                body="The manifest entry makes the table part of the shared realtime subscription."
              />
              <CodePanel>{`tables: ["cases"]`}</CodePanel>
              <BackendStep
                number="3"
                title="Read it through the SDK"
                body="The core provider supplies live rows; the module never opens another channel."
              />
              <CodePanel>{`const { rows, loading, stale } =
  useModuleTable("team-name", "cases");`}</CodePanel>
            </CardContent>
          </Card>

          <Card className="ops-panel gap-0 overflow-hidden py-0">
            <CardHeader className="ops-panel-header">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ModuleIcon name="radio-tower" className="size-4.5" />
                </span>
                <div>
                  <p className="ops-kicker">Supabase Edge Functions</p>
                  <CardTitle className="mt-1 text-lg">Server-side logic, scoped by folder</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 py-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Use a function for webhooks, secret-bearing API calls, controlled public
                actions, or work a browser and loader should not perform directly.
              </p>
              <CodePanel>{`backend/functions/
└─ summary/
   └─ index.ts`}</CodePanel>
              <div className="grid gap-2 sm:grid-cols-2">
                <ContractField label="Folder" value="summary" />
                <ContractField label="Deployed name" value="team-name-summary" />
                <ContractField label="Runtime" value="Supabase Edge / Deno" />
                <ContractField label="Release" value="green merge to main" />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">
                  Call it from the module UI
                </p>
                <CodePanel>{`const result = await invokeModuleFunction(
  "team-name",
  "summary",
  { caseId }
);`}</CodePanel>
              </div>
              <p className="rounded-lg border border-border bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
                Functions are discovered from their folders—do not list them in the
                manifest. Include CORS handling and validate authentication or request data
                inside the function.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="flex gap-3 rounded-lg border border-primary/25 bg-primary/[0.06] p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ModuleIcon name="shield" className="size-4" />
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Deployment boundary:</strong> contributors
            commit schema and function files inside their module. CI validates them; the
            protected post-merge workflow applies DDL and deploys functions to the shared event
            project. Participants do not need production database credentials.
          </p>
        </div>
      </section>

      <section aria-labelledby="golden-path" className="space-y-3">
        <SectionHeading
          eyebrow="Get running"
          id="golden-path"
          title="From clone to first signal"
          body="The participant path uses the shared event project. Local Supabase is for organisers and CI."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {GOLDEN_PATH.map((step) => (
            <Card key={step.number} className="gap-0 py-0">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[2rem_minmax(0,1fr)]">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
                <div className="min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <CodeBlock>{step.command}</CodeBlock>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.note}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Guardrail
          icon="shield-check"
          title="Scoped credentials"
          body="A module token can write only its own registry row, signals, table prefix, and media folder."
        />
        <Guardrail
          icon="radio"
          title="Shared realtime"
          body="Modules never open their own channel. The core provider subscribes once and fans updates out."
        />
        <Guardrail
          icon="siren"
          title="Organiser control"
          body="The enabled kill-switch removes a module and its signals from every live surface immediately."
        />
      </section>

      <section className="rounded-xl border border-primary/30 bg-primary/[0.07] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="ops-kicker">Ready to build?</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Start with your team folder.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep collection in Python, interface work in TypeScript, and let signals connect them.
          </p>
        </div>
        <div className="mt-4 shrink-0 sm:mt-0">
          <CodeBlock>pnpm new-module team-&lt;name&gt;</CodeBlock>
        </div>
      </section>
    </div>
  );
}

function HeroFact({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 px-3 py-2.5">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function FlowStage({
  number,
  icon,
  title,
  label,
  body,
  final,
}: (typeof FLOW)[number] & { final: boolean }) {
  return (
    <Card className="ops-panel relative gap-0 overflow-visible py-0">
      {!final && (
        <span
          className="absolute top-1/2 -right-3 z-10 hidden h-px w-3 bg-primary/60 xl:block"
          aria-hidden
        />
      )}
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <ModuleIcon name={icon} className="size-4.5" />
          </span>
          <span className="font-mono text-xs text-muted-foreground">{number}</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-primary">{label}</p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function FileTree() {
  return (
    <div className="rounded-lg border border-border bg-[#071827] p-4 font-mono text-xs leading-7 text-slate-300">
      <p className="font-semibold text-white">modules/team-name/</p>
      <p>
        <span className="text-slate-500">├─</span>{" "}
        <span className="text-primary">module.config.ts</span>
      </p>
      <p>
        <span className="text-slate-500">├─</span> ui/
      </p>
      <p className="pl-4">
        <span className="text-slate-500">└─</span> index.tsx
      </p>
      <p>
        <span className="text-slate-500">├─</span> loader/
      </p>
      <p className="pl-4">
        <span className="text-slate-500">└─</span> src/main.py
      </p>
      <p>
        <span className="text-slate-500">└─</span> backend/{" "}
        <span className="text-slate-500">optional</span>
      </p>
      <p className="pl-4">
        <span className="text-slate-500">├─</span> schema.sql
      </p>
      <p className="pl-4">
        <span className="text-slate-500">└─</span> functions/
      </p>
      <p className="pl-8">
        <span className="text-slate-500">└─</span> summary/index.ts
      </p>
    </div>
  );
}

function Boundary({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-muted/25 p-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-primary">
        <ModuleIcon name={icon} className="size-4" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function ContractField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-2.5">
      <p className="ops-kicker">{label}</p>
      <p className="mt-1 text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}

function BackendStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Guardrail({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ModuleIcon name={icon} className="size-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  eyebrow,
  id,
  title,
  body,
}: {
  eyebrow: string;
  id: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="ops-kicker">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <code className="block overflow-x-auto rounded-md border border-border bg-[#071827] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-nowrap text-slate-200">
      {children}
    </code>
  );
}

function CodePanel({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-[#071827] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
      <code>{children}</code>
    </pre>
  );
}
