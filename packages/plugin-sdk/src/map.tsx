"use client";

import { useContext, useEffect, useMemo, useRef, type ReactElement } from "react";
import maplibregl from "maplibre-gl";
// NOTE: maplibre's stylesheet is NOT imported here on purpose — module.config.ts
// files import @wcc-impact/plugin-sdk, and scripts/gen-registry.ts evaluates them under
// Node (tsx), which cannot load CSS. The dashboard's globals.css imports it once:
//   @import "maplibre-gl/dist/maplibre-gl.css";
import type { SignalRow } from "@wcc-impact/shared";
import { severityColor, timeAgo } from "@wcc-impact/ui";
import { SignalContext, requireStore } from "./context";
import { applyFilter, type SignalFilter } from "./use-signals";

// Wellington default view (PLAN §5) and a free, no-key vector basemap.
const WELLINGTON_CENTER: [number, number] = [174.7787, -41.2924];
const WELLINGTON_ZOOM = 12;
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Popup content is built as an HTML string, and titles/descriptions are
// community input headed for the big screen — escape everything.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function popupHtml(s: SignalRow): string {
  const desc = s.description
    ? s.description.length > 160
      ? `${s.description.slice(0, 160)}…`
      : s.description
    : null;
  // WCC light tokens: foreground #16181d, muted-foreground #5c6169. The Positron
  // basemap and MapLibre popup are always light, so these read on the popup's
  // white background. escapeHtml() below is load-bearing — do not remove it.
  return `
    <div style="font:13px/1.45 var(--font-sans,ui-sans-serif,system-ui,sans-serif);max-width:250px;color:#16181d">
      <div style="font-weight:600;font-size:14px;margin-bottom:3px">${escapeHtml(s.title)}</div>
      ${s.place_name ? `<div style="color:#5c6169">${escapeHtml(s.place_name)}</div>` : ""}
      ${desc ? `<div style="margin-top:5px">${escapeHtml(desc)}</div>` : ""}
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;color:#5c6169;font-size:12px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:${severityColor(s.severity)}"></span>
        <span>${escapeHtml(s.severity ?? "unknown")} · ${escapeHtml(s.verification ?? "unverified")} · ${escapeHtml(s.source_type ?? "unknown source")} · ${escapeHtml(timeAgo(s.created_at))}</span>
      </div>
    </div>`;
}

/**
 * The shared MapLibre map: Wellington default view, severity-coloured markers,
 * click-for-popup. Pass `signals` OR `filter`; if both, `signals` wins.
 * Modules never own a map instance — this component owns MapLibre; you only
 * choose which signals it plots. Signals without lat/lng are skipped.
 * Default height 400px unless `className` sizes it.
 *
 * @example
 * <SignalMap filter={{ moduleId: "team-coast-watch" }} className="h-[500px]" />
 */
export function SignalMap({
  signals,
  filter,
  className,
}: {
  signals?: SignalRow[];
  filter?: SignalFilter;
  className?: string;
}): ReactElement {
  // Context is optional only when explicit `signals` are passed.
  const store = useContext(SignalContext);
  const fromStore = useMemo(
    () => (signals ? [] : applyFilter(requireStore(store, "<SignalMap filter>").signals, filter)),
    [signals, store?.signals, filter?.moduleId, filter?.signalType, filter?.since],
  );
  const data = signals ?? fromStore;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: WELLINGTON_CENTER,
      zoom: WELLINGTON_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // A map can live inside a resizable dashboard widget. MapLibre measures its
  // canvas only at construction unless resize() is called; observe the actual
  // container so sidebar changes and grid resizing never leave a blank strip.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => mapRef.current?.resize());
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Sync markers with the signals (simple clear-and-redraw — fine at event scale).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markersRef.current) m.remove();

    const located = data.filter(
      (s): s is SignalRow & { lat: number; lng: number } =>
        typeof s.lat === "number" && typeof s.lng === "number",
    );
    markersRef.current = located.map((s) => {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;border:2px solid #fff;outline-offset:3px;" +
        `box-shadow:0 0 4px rgba(0,0,0,.45);cursor:pointer;background:${severityColor(s.severity)}`;
      el.title = s.title;
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute(
        "aria-label",
        `${s.severity ?? "Unknown severity"} report: ${s.title}${
          s.place_name ? `, ${s.place_name}` : ""
        }. ${s.verification ?? "Unverified"}.`,
      );
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup({ offset: 12, maxWidth: "280px" }).setHTML(popupHtml(s)))
        .addTo(map);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          marker.togglePopup();
        }
      });
      return marker;
    });
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="region"
      aria-label="Interactive map of Wellington emergency reports"
      // Contract: default height 400px unless className sizes it.
      style={className ? undefined : { height: 400, width: "100%" }}
    />
  );
}
