"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wcc-impact/plugin-sdk";
import { ModeToggle } from "./ModeToggle";
import registry from "../registry.gen";

const STORAGE_KEY = "wcc.nav.collapsed";

/**
 * Left-hand nav: stable build-time module catalogue plus runtime registrations.
 * Runtime-disabled rows stay hidden. The desktop rail is collapsible and the
 * same destinations remain available in the mobile bottom navigation.
 *
 * @example <NavShell />  // mounted once in the root layout
 */
export function NavShell() {
  const pathname = usePathname();
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

        {withLabel(
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

        {withLabel(
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

        <div
          className={cn(
            "mt-5 mb-1 text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase",
            collapsed ? "px-0 text-center" : "px-3",
          )}
        >
          {collapsed ? "···" : "Modules"}
        </div>

        {tiles.length === 0 && !collapsed && (
          <p className="mx-1 rounded-md border border-dashed border-sidebar-border px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
            Response modules will appear here when available.
          </p>
        )}

        {tiles.map((m) => {
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
                  aria-current={active ? "page" : undefined}
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
                  <Link href={base} className={subClass(pathname === base)}>
                    Overview
                  </Link>
                  {pages.map((p) => (
                    <Link
                      key={p.slug}
                      href={`${base}/${p.slug}`}
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
        {!collapsed && (
          <>
            <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-400">
              <span>System coverage</span>
              <span className="font-medium text-slate-200">
                {`${tiles.length} module${tiles.length === 1 ? "" : "s"} available`}
              </span>
            </div>
            <ModeToggle />
          </>
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

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch overflow-x-auto border-t border-sidebar-border bg-sidebar px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(3,12,20,.18)] md:hidden"
      >
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(
            "flex min-w-20 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
            pathname === "/" ? "text-primary" : "text-slate-400",
          )}
        >
          <Map className="size-4.5" aria-hidden />
          Overview
        </Link>
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={cn(
            "flex min-w-20 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
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
            "flex min-w-20 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
            pathname === "/activity" ? "text-primary" : "text-slate-400",
          )}
        >
          <Activity className="size-4.5" aria-hidden />
          Diagnostics
        </Link>
        {tiles.map((m) => {
          const entry = registry.find((e) => e.id === m.id);
          const base = `/modules/${m.id}`;
          const active = pathname === base || pathname.startsWith(`${base}/`);
          return (
            <Link
              key={m.id}
              href={base}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-20 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                active ? "text-primary" : "text-slate-400",
              )}
            >
              <ModuleIcon name={m.icon ?? entry?.icon} className="size-4.5" />
              <span className="max-w-20 truncate">{m.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
