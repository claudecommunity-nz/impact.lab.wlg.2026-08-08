"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Map,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
import registry from "../registry.gen";

const STORAGE_KEY = "wcc.nav.collapsed";

/**
 * Left-hand nav: home link + one tile per registered module (live from the
 * realtime `modules` table; only enabled rows render). Collapsible to an
 * icon-only rail — the state persists in localStorage. Tiles show tooltips when
 * collapsed.
 *
 * @example <NavShell />  // mounted once in the root layout
 */
export function NavShell() {
  const pathname = usePathname();
  const { modules, loading } = useModules();
  const tiles = modules.filter((m) => m.enabled);

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
      "group flex items-center rounded-md text-[13px] font-medium transition-colors",
      collapsed ? "justify-center p-2" : "gap-2.5 px-2.5 py-1.5",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
      <div className="fixed inset-x-0 top-0 z-40 flex h-13 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[86vw] max-w-xs">
            <SheetHeader>
              <SheetTitle>WCC Emergency</SheetTitle>
              <SheetDescription>Common operating picture</SheetDescription>
            </SheetHeader>
            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
              {[
                { href: "/", label: "Live picture", icon: Map },
                { href: "/dashboard", label: "My dashboard", icon: LayoutDashboard },
                { href: "/activity", label: "Lab activity", icon: Activity },
              ].map((item) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                      pathname === item.href
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
              <p className="mt-4 px-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Modules
              </p>
              {tiles.map((module) => (
                <SheetClose asChild key={module.id}>
                  <Link
                    href={`/modules/${module.id}`}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ModuleIcon
                      name={module.icon ?? registry.find((entry) => entry.id === module.id)?.icon}
                      className="size-4"
                    />
                    {module.name}
                  </Link>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            W
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            WCC Emergency
          </span>
        </Link>
      </div>
      <nav
      data-collapsed={collapsed}
      className={cn(
        // Fixed to the viewport: the rail stays put while the main content
        // scrolls; the nav list scrolls internally, footer pinned to the bottom.
        "sticky top-0 flex h-dvh shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar transition-[width] duration-200 max-md:hidden",
        collapsed ? "w-14" : "w-60",
      )}
      >
      {/* Brand — the one place the WCC yellow leads */}
      <div className={cn("flex items-center gap-2.5 py-3.5", collapsed ? "justify-center px-0" : "px-4")}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            W
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[13px] leading-tight font-semibold text-foreground">
                WCC Emergency
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                Common operating picture
              </span>
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {withLabel(
          "Live picture",
          <Link href="/" className={linkClass(pathname === "/")}>
            <Map className="size-4 shrink-0" aria-hidden />
            {!collapsed && (
              <>
                <span>Live picture</span>
                <span
                  className={cn(
                    "ml-auto size-1.5 rounded-full",
                    tiles.length > 0 ? "bg-ok" : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
              </>
            )}
          </Link>,
        )}

        {withLabel(
          "Lab activity",
          <Link href="/activity" className={linkClass(pathname === "/activity")}>
            <Activity className="size-4 shrink-0" aria-hidden />
            {!collapsed && (
              <>
                <span>Lab activity</span>
                <span className="ml-auto size-1.5 animate-pulse rounded-full bg-ok" aria-hidden />
              </>
            )}
          </Link>,
        )}

        {withLabel(
          "My dashboard",
          <Link
            href="/dashboard"
            className={linkClass(pathname === "/dashboard")}
          >
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            {!collapsed && <span>My dashboard</span>}
          </Link>,
        )}

        <div
          className={cn(
            "mt-5 mb-1 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase",
            collapsed ? "px-0 text-center" : "px-2.5",
          )}
        >
          {collapsed ? "···" : "Modules"}
        </div>

        {loading && !collapsed && (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Loading…</p>
        )}
        {!loading && tiles.length === 0 && !collapsed && (
          <p className="px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
            No modules yet — run your loader to register the first one.
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
              a ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            );
          return (
            <div key={m.id} className="contents">
              {withLabel(
                m.name,
                <Link href={base} className={linkClass(active)}>
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
          "space-y-2.5 border-t border-sidebar-border py-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && (
          <>
            <p className="px-0.5 text-[10px] leading-snug text-muted-foreground/80">
              Prototype built alongside Wellington City Council — not real emergency
              information. In an emergency call{" "}
              <span className="font-semibold text-urgency">111</span>.
            </p>
            <div className="px-0.5 text-[11px] text-muted-foreground">
              {tiles.length} module{tiles.length === 1 ? "" : "s"} live
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
              "flex items-center gap-2 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
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
    </>
  );
}
