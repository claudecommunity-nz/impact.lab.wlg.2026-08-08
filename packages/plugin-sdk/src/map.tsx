"use client";

import { useContext, useEffect, useMemo, useRef, type ReactElement } from "react";
import maplibregl from "maplibre-gl";
// NOTE: maplibre's stylesheet is NOT imported here on purpose — module.config.ts
// files import @wcc-impact/plugin-sdk, and scripts/gen-registry.ts evaluates them under
// Node (tsx), which cannot load CSS. The dashboard's globals.css imports it once:
//   @import "maplibre-gl/dist/maplibre-gl.css";
import type { Severity, SignalRow } from "@wcc-impact/shared";
import { severityColor, timeAgo } from "@wcc-impact/ui";
import { SignalContext, requireStore } from "./context";
import { applyFilter, type SignalFilter } from "./use-signals";

export interface MapLocationSelection {
  lat: number;
  lng: number;
  signalId?: string;
  title?: string;
}

export interface MapHighlight {
  id: string;
  lat: number;
  lng: number;
  label: string;
  count: number;
  highestSeverity?: Severity;
  extent?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

// Wellington default view (PLAN §5) and a free, no-key vector basemap.
const WELLINGTON_CENTER: [number, number] = [174.7787, -41.2924];
const WELLINGTON_ZOOM = 12;
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const HIGHLIGHT_SOURCE_ID = "wcc-map-highlight-extents";
const HIGHLIGHT_FILL_LAYER_ID = "wcc-map-highlight-fill";
const HIGHLIGHT_LINE_LAYER_ID = "wcc-map-highlight-line";

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
        <span>${escapeHtml(s.severity ?? "unknown")} · ${escapeHtml(s.verification ?? "unverified")} · ${escapeHtml(s.source_type ?? "unknown source")} · event ${escapeHtml(timeAgo(s.observed_at ?? s.reported_at ?? s.created_at))}</span>
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
  onLocationSelect,
  selectedLocation,
  highlights = [],
  focusSelectedLocation = false,
}: {
  signals?: SignalRow[];
  filter?: SignalFilter;
  className?: string;
  onLocationSelect?: (selection: MapLocationSelection) => void;
  selectedLocation?: Pick<MapLocationSelection, "lat" | "lng"> | null;
  highlights?: MapHighlight[];
  focusSelectedLocation?: boolean;
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
  const highlightsRef = useRef<maplibregl.Marker[]>([]);
  const selectionMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

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
    map.on("click", (event) => {
      onLocationSelectRef.current?.({
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
      });
    });
    mapRef.current = map;
    return () => {
      for (const marker of highlightsRef.current) marker.remove();
      highlightsRef.current = [];
      selectionMarkerRef.current?.remove();
      selectionMarkerRef.current = null;
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
        "width:40px;height:40px;display:grid;place-items:center;cursor:pointer;outline-offset:1px;";
      const dot = document.createElement("span");
      dot.style.cssText =
        "display:block;width:16px;height:16px;border-radius:50%;border:2px solid #fff;" +
        `box-shadow:0 0 4px rgba(0,0,0,.45);background:${severityColor(s.severity)}`;
      el.append(dot);
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
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        onLocationSelectRef.current?.({
          lat: s.lat,
          lng: s.lng,
          signalId: s.id,
          title: s.title,
        });
      });
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onLocationSelectRef.current?.({
            lat: s.lat,
            lng: s.lng,
            signalId: s.id,
            title: s.title,
          });
          marker.togglePopup();
        }
      });
      return marker;
    });
  }, [data]);

  // Analytical highlights are visually distinct from individual reports.
  // Their count bubble means "automated grouping", never a confirmed incident.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of highlightsRef.current) marker.remove();

    highlightsRef.current = highlights
      .filter(
        (highlight) =>
          Number.isFinite(highlight.lat) &&
          Number.isFinite(highlight.lng) &&
          highlight.lat >= -90 &&
          highlight.lat <= 90 &&
          highlight.lng >= -180 &&
          highlight.lng <= 180,
      )
      .map((highlight) => {
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.mapHighlight = highlight.id;
        el.style.cssText =
          "min-width:40px;height:40px;padding:0 9px;display:grid;place-items:center;" +
          "border-radius:999px;border:3px solid #ffdd00;background:#0b2538;color:#fff;" +
          "font:700 13px/1 ui-sans-serif,system-ui,sans-serif;" +
          "box-shadow:0 0 0 3px rgba(255,255,255,.88),0 4px 14px rgba(0,0,0,.42);" +
          "cursor:pointer;outline-offset:3px;";
        el.textContent = String(Math.max(0, Math.trunc(highlight.count)));
        el.title = `${highlight.label} analysis cell: ${highlight.count} severe or extreme reports`;
        el.setAttribute(
          "aria-label",
          `Automated analysis cell near ${highlight.label}: ${highlight.count} severe or extreme reports. Inspect nearby evidence.`,
        );

        const select = () =>
          onLocationSelectRef.current?.({
            lat: highlight.lat,
            lng: highlight.lng,
            title: `Nearby evidence at the ${highlight.label} analysis cell`,
          });
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          select();
        });
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            select();
          }
        });

        return new maplibregl.Marker({ element: el })
          .setLngLat([highlight.lng, highlight.lat])
          .addTo(map);
      });

    return () => {
      for (const marker of highlightsRef.current) marker.remove();
      highlightsRef.current = [];
    };
  }, [highlights]);

  // Draw each analytical cell as a dashed geographic extent. The neutral,
  // translucent treatment communicates uncertainty and keeps it distinct from
  // both report severity markers and future human-confirmed incident symbols.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const featureCollection = {
      type: "FeatureCollection" as const,
      features: highlights
        .filter((highlight) => Boolean(highlight.extent))
        .map((highlight) => ({
          type: "Feature" as const,
          properties: { id: highlight.id },
          geometry: highlight.extent!,
        })),
    };

    const syncExtents = () => {
      const existing = map.getSource(HIGHLIGHT_SOURCE_ID);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(featureCollection);
        return;
      }
      map.addSource(HIGHLIGHT_SOURCE_ID, {
        type: "geojson",
        data: featureCollection,
      });
      map.addLayer({
        id: HIGHLIGHT_FILL_LAYER_ID,
        type: "fill",
        source: HIGHLIGHT_SOURCE_ID,
        paint: {
          "fill-color": "#ffdd00",
          "fill-opacity": 0.08,
        },
      });
      map.addLayer({
        id: HIGHLIGHT_LINE_LAYER_ID,
        type: "line",
        source: HIGHLIGHT_SOURCE_ID,
        paint: {
          "line-color": "#6b5c00",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
    };

    if (map.isStyleLoaded()) syncExtents();
    else map.on("load", syncExtents);
    return () => {
      map.off("load", syncExtents);
    };
  }, [highlights]);

  // Keep one high-contrast, non-interactive ring on the inspected coordinate.
  // It surrounds report markers without covering their severity colour.
  useEffect(() => {
    const map = mapRef.current;
    selectionMarkerRef.current?.remove();
    selectionMarkerRef.current = null;
    if (!map || !selectedLocation) return;

    const el = document.createElement("div");
    el.style.cssText =
      "width:34px;height:34px;border-radius:50%;border:3px solid #005c9a;" +
      "box-shadow:0 0 0 3px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.5);" +
      "pointer-events:none;";
    el.setAttribute("aria-hidden", "true");
    selectionMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([selectedLocation.lng, selectedLocation.lat])
      .addTo(map);
    // MapLibre makes marker elements keyboard-focusable by default. This ring
    // only reflects the current selection, so keep it out of the accessibility tree.
    el.tabIndex = -1;
    el.removeAttribute("role");
    el.setAttribute("aria-hidden", "true");

    if (focusSelectedLocation) {
      map.easeTo({
        center: [selectedLocation.lng, selectedLocation.lat],
        duration: 500,
      });
    }

    return () => {
      selectionMarkerRef.current?.remove();
      selectionMarkerRef.current = null;
    };
  }, [
    selectedLocation?.lat,
    selectedLocation?.lng,
    focusSelectedLocation,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="region"
      aria-label={
        onLocationSelect
          ? "Interactive map of Wellington emergency reports. Press Enter to inspect the map centre."
          : "Interactive map of Wellington emergency reports"
      }
      tabIndex={onLocationSelect ? 0 : undefined}
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" ||
          event.target !== event.currentTarget ||
          !onLocationSelect
        ) {
          return;
        }
        event.preventDefault();
        const center = mapRef.current?.getCenter();
        if (center) onLocationSelect({ lat: center.lat, lng: center.lng });
      }}
      // Contract: default height 400px unless className sizes it.
      style={className ? undefined : { height: 400, width: "100%" }}
    />
  );
}
