"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from "lucide-react";
import {
  useModules,
  cn,
  ModuleIcon,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wcc-impact/plugin-sdk";
import { ModeToggle } from "./ModeToggle";
import { useAudience } from "./AudienceProvider";
import registry from "../registry.gen";

const STORAGE_KEY = "wcc.nav.collapsed";

/**
 * Left-hand nav: stable build-time module catalogue plus runtime registrations.
 * Runtime-disabled rows stay hidden. The desktop rail is collapsible and the
 * mobile bottom navigation keeps stable primary destinations and exposes
 * modules through a dedicated sheet.
 *
 * @example <NavShell />  // mounted once in the root layout
 */
export function NavShell() {
  const pathname = usePathname();
  const { audience, setAudience } = useAudience();
  const operations = audience === "operations";
  const { modules } = useModules();
  const runtimeById = new globalThis.Map(modules.map((module) => [module.id, module]));
  const catalogueIds = new Set(registry.map((entry) => entry.id));
  const tiles = [
    ...registry
      .filter((entry) => runtimeById.get(entry.id)?.enabled !== false)
      .map((entry) => {
        const runtime = runtimeById.get(entry.id);
        return {
          id: entry.id,
          name: runtime?.name ?? entry.name,
          icon: runtime?.icon ?? entry.icon,
        };
      }),
    ...modules
      .filter((module) => module.enabled && !catalogueIds.has(module.id))
      .map((module) => ({
        id: module.id,
        name: module.name,
        icon: module.icon,
      })),
  ];

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const linkClass = (active: boolean) =>
    cn(
      "group flex min-h-10 items-center rounded-md text-[13px] font-medium motion-safe:transition-colors",
      collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
      active
        ? "bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]"
        : "text-slate-300 hover:bg-sidebar-accent hover:text-white",
      "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none",
    );

  // Wrap a nav item in a tooltip only when collapsed (label otherwise inline).
  // `key` is applied to the returned wrapper so it's valid inside .map().
  const withLabel = (label: string, node: ReactNode, key?: string) =>
    collapsed ? (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    ) : (
      <div key={key} className="contents">
        {node}
      </div>
    );

  return (
    <>
      <nav
        data-collapsed={collapsed}
        aria-label="Primary navigation"
        className={cn(
          // Fixed to the viewport: the rail stays put while the main content
          // scrolls; the nav list scrolls internally, footer pinned to the bottom.
          "sticky top-0 z-30 flex h-dvh shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar transition-[width] duration-200 max-md:hidden",
          collapsed ? "w-16" : "w-56",
        )}
      >
      {/* Brand — the one place the WCC yellow leads */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-sidebar-border py-4",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <Link
          href="/"
          aria-label={collapsed ? "Wellington Response home" : undefined}
          className="flex min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_6px_18px_rgba(255,221,0,.18)]">
            <ShieldCheck className="size-4.5" strokeWidth={2.25} aria-hidden />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[13px] leading-tight font-semibold tracking-[0.01em] text-white">
                Wellington Response
              </span>
              <span className="mt-0.5 block truncate text-[10px] leading-tight tracking-[0.08em] text-slate-400 uppercase">
                Emergency dashboard
              </span>
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 pt-4 pb-2">
        {withLabel(
          "Situation overview",
          <Link
            href="/"
            aria-label={collapsed ? "Situation overview" : undefined}
            aria-current={pathname === "/" ? "page" : undefined}
            className={linkClass(pathname === "/")}
          >
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            {!collapsed && (
              <>
                <span>Situation overview</span>
              </>
            )}
          </Link>,
        )}

        {operations &&
          withLabel(
            "My dashboard",
            <Link
              href="/dashboard"
              aria-label={collapsed ? "My dashboard" : undefined}
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              className={linkClass(pathname === "/dashboard")}
            >
              <LayoutDashboard className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>My dashboard</span>}
            </Link>,
          )}

        {operations &&
          withLabel(
            "Platform diagnostics",
            <Link
              href="/activity"
              aria-label={collapsed ? "Platform diagnostics" : undefined}
              aria-current={pathname === "/activity" ? "page" : undefined}
              className={linkClass(pathname === "/activity")}
            >
              <Activity className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>Platform diagnostics</span>}
            </Link>,
          )}

        {operations && (
          <div
            className={cn(
              "mt-5 mb-1 text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase",
              collapsed ? "px-0 text-center" : "px-3",
            )}
          >
            {collapsed ? "···" : "Modules"}
          </div>
        )}

        {operations && tiles.length === 0 && !collapsed && (
          <p className="mx-1 rounded-md border border-dashed border-sidebar-border px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
            No modules are installed in this dashboard.
          </p>
        )}

        {operations && tiles.map((m) => {
          const entry = registry.find((e) => e.id === m.id);
          const base = `/modules/${m.id}`;
          const active = pathname === base || pathname.startsWith(`${base}/`);
          const pages = entry?.pages ?? [];
          const subClass = (a: boolean) =>
            cn(
              "block rounded-md px-2.5 py-1 text-[12px] transition-colors",
              a ? "text-white" : "text-slate-400 hover:text-white",
            );
          return (
            <div key={m.id} className="contents">
              {withLabel(
                m.name,
                <Link
                  href={base}
                  aria-label={collapsed ? m.name : undefined}
                  aria-current={
                    pathname === base && (collapsed || pages.length === 0) ? "page" : undefined
                  }
                  className={linkClass(active)}
                >
                  <span className="sr-only">{collapsed ? m.name : ""}</span>
                  <ModuleIcon name={m.icon ?? entry?.icon} className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{m.name}</span>}
                </Link>,
              )}
              {/* Sub-navigation for modules that declare extra pages. */}
              {!collapsed && active && pages.length > 0 && (
                <div className="my-0.5 ml-[1.375rem] flex flex-col border-l border-sidebar-border pl-2">
                  <Link
                    href={base}
                    aria-current={pathname === base ? "page" : undefined}
                    className={subClass(pathname === base)}
                  >
                    Overview
                  </Link>
                  {pages.map((p) => (
                    <Link
                      key={p.slug}
                      href={`${base}/${p.slug}`}
                      aria-current={pathname === `${base}/${p.slug}` ? "page" : undefined}
                      className={subClass(pathname === `${base}/${p.slug}`)}
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "space-y-3 border-t border-sidebar-border py-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && operations && (
          <>
            <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-400">
              <span>Installed modules</span>
              <span className="font-medium text-slate-200">{tiles.length}</span>
            </div>
          </>
        )}
        {!collapsed && (
          <div className="space-y-2">
            {operations ? (
              <Link
                href="/"
                onClick={() => setAudience("public")}
                className="flex min-h-10 w-full items-center justify-between rounded-md border border-sidebar-border px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <span>Audience</span>
                <span className="text-primary">Public view</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setAudience("operations")}
                className="flex min-h-10 w-full items-center justify-between rounded-md border border-sidebar-border px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <span>Public view</span>
                <span className="text-primary">Open operations</span>
              </button>
            )}
            <ModeToggle />
          </div>
        )}
        {withLabel(
          collapsed ? "Expand sidebar" : "Collapse sidebar",
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex items-center gap-2 rounded-md py-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-sidebar-accent hover:text-white",
              collapsed ? "w-full justify-center" : "w-full px-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span>Collapse</span>
              </>
            )}
          </button>,
        )}
      </div>
      </nav>

      <Sheet>
        <nav
          aria-label="Mobile navigation"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 grid h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t border-sidebar-border bg-sidebar px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(3,12,20,.18)] md:hidden",
            operations ? "grid-cols-4" : "grid-cols-2",
          )}
        >
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
              pathname === "/" ? "text-primary" : "text-slate-400",
            )}
          >
            <Map className="size-4.5" aria-hidden />
            Overview
          </Link>
          {operations ? (
            <>
              <Link
                href="/dashboard"
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  pathname === "/dashboard" ? "text-primary" : "text-slate-400",
                )}
              >
                <LayoutDashboard className="size-4.5" aria-hidden />
                Dashboard
              </Link>
              <Link
                href="/activity"
                aria-current={pathname === "/activity" ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  pathname === "/activity" ? "text-primary" : "text-slate-400",
                )}
              >
                <Activity className="size-4.5" aria-hidden />
                Diagnostics
              </Link>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                    pathname.startsWith("/modules/") ? "text-primary" : "text-slate-400",
                  )}
                >
                  <Boxes className="size-4.5" aria-hidden />
                  Modules
                </button>
              </SheetTrigger>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAudience("operations")}
              className="flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-400 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <ShieldCheck className="size-4.5" aria-hidden />
              Open operations
            </button>
          )}
        </nav>

        <SheetContent
          side="bottom"
          className="max-h-[82dvh] overflow-y-auto border-sidebar-border bg-sidebar px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sidebar-foreground md:hidden"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white">Installed modules</SheetTitle>
            <SheetDescription className="text-slate-400">
              Open a response module or one of its workspace pages.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            <SheetClose asChild>
              <Link
                href="/"
                onClick={() => setAudience("public")}
                className="flex min-h-11 items-center justify-between rounded-md border border-sidebar-border px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <span>Audience</span>
                <span className="text-primary">Switch to public view</span>
              </Link>
            </SheetClose>

            {tiles.length === 0 && (
              <p className="rounded-md border border-dashed border-sidebar-border px-3 py-4 text-sm leading-relaxed text-slate-400">
                No modules are installed in this dashboard.
              </p>
            )}

            {tiles.map((m) => {
              const entry = registry.find((e) => e.id === m.id);
              const base = `/modules/${m.id}`;
              const pages = entry?.pages ?? [];
              return (
                <section
                  key={m.id}
                  aria-labelledby={`mobile-module-${m.id}`}
                  className="rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-2"
                >
                  <h2 id={`mobile-module-${m.id}`} className="sr-only">
                    {m.name}
                  </h2>
                  <SheetClose asChild>
                    <Link
                      href={base}
                      aria-current={pathname === base ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                        pathname === base
                          ? "bg-primary text-primary-foreground"
                          : "text-white hover:bg-sidebar-accent",
                      )}
                    >
                      <ModuleIcon name={m.icon ?? entry?.icon} className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="text-[10px] tracking-[0.1em] uppercase opacity-65">
                        Overview
                      </span>
                    </Link>
                  </SheetClose>

                  {pages.length > 0 && (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      {pages.map((p) => {
                        const href = `${base}/${p.slug}`;
                        const current = pathname === href;
                        return (
                          <SheetClose key={p.slug} asChild>
                            <Link
                              href={href}
                              aria-current={current ? "page" : undefined}
                              className={cn(
                                "flex min-h-11 items-center rounded-md px-3 py-2 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                                current
                                  ? "bg-primary text-primary-foreground"
                                  : "text-slate-300 hover:bg-sidebar-accent hover:text-white",
                              )}
                            >
                              <span className="truncate">{p.name}</span>
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
