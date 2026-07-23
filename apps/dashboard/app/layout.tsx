import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Source_Sans_3 } from "next/font/google";
import { AlertTriangle } from "lucide-react";
import { moduleTableName, SignalProvider, Toaster, TooltipProvider } from "@wcc-impact/plugin-sdk";
import registry from "../registry.gen";
import { NavShell } from "../components/NavShell";
import { ThemeProvider } from "../components/ThemeProvider";
import "./globals.css";

/**
 * Full names of every module-owned table declared across all manifests, e.g.
 * ["m_demo_seed_pins"]. Passed to the ONE provider so it also watches these on
 * the single realtime channel (consumed via useModuleTable). Computed once at
 * module scope from the generated registry, so the reference is stable.
 */
const MODULE_TABLES = registry.flatMap((m) =>
  (m.tables ?? []).map((t) => moduleTableName(m.id, t)),
);

/**
 * WCC's site uses Guardian Sans (a proprietary Commercial Type face we can't
 * redistribute); Source Sans 3 is an open humanist stand-in with a similar feel.
 * next/font self-hosts it at build time — no runtime CDN dependency (venue-safe).
 */
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WCC Emergency — Common Operating Picture",
  description:
    "Hackathon prototype built alongside Wellington City Council — not real emergency information.",
};

/**
 * Root layout: SignalProvider mounted ONCE here owns the app's single realtime
 * channel — signals AND modules Postgres Changes (CONTRACTS §4 — nothing else
 * may open a channel; consume via useSignals()/useModules() from the SDK).
 * Every page renders inside the nav shell under the permanent disclaimer banner.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sourceSans.variable} suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <SignalProvider moduleTables={MODULE_TABLES}>
            <TooltipProvider delayDuration={200}>
              <div className="flex min-h-screen">
                <NavShell />
                <a
                  href="#main-content"
                  className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
                >
                  Skip to dashboard
                </a>
                <main
                  id="main-content"
                  className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
                >
                  <div
                    role="note"
                    className="sticky top-0 z-40 flex min-h-8 items-center justify-center gap-2 border-b border-amber-300/25 bg-amber-400 px-3 py-1.5 text-center text-[11px] leading-tight font-semibold text-slate-950 shadow-sm"
                  >
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    <span>
                      Demonstration data — not official emergency information. In immediate
                      danger, call <strong>111</strong>.
                    </span>
                  </div>
                  {children}
                </main>
              </div>
              <Toaster richColors position="top-right" />
            </TooltipProvider>
          </SignalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
