// Shared types + tiny helpers for the newsroom module pages. Local to the module
// (pages import from "../ui/shared"); the SDK stays the only external import.

export const MODULE_ID = "newsroom";

export type Article = {
  id: string;
  created_at: string;
  url: string;
  title: string;
  summary: string | null;
  source_id: string;
  source_name: string;
  published_at: string | null;
  image_url: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  signal_id: string | null;
};

export type Comment = {
  id: string;
  created_at: string;
  article_id: string;
  author_name: string;
  author_location: string | null;
  body: string;
  image_url: string | null;
};

export type Source = {
  id: string;
  source_id: string;
  name: string;
  url: string;
  format: string;
  category: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_item_count: number | null;
  last_duration_ms: number | null;
};

export type Refresh = {
  id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  sources_ok: number;
  sources_failed: number;
  new_articles: number;
  new_signals: number;
};

/** "just now" / "5m ago" / "3h ago" / "2d ago" from an ISO timestamp. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "Tue 22 Jul, 3:45 PM" — absolute published time (NZ locale). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
    timeZoneName: "short",
  });
}

/** A stable hue (0–359) for a source, for chips + image fallbacks. */
export function sourceHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

/** Read a File as a bare base64 string (no data: prefix) for the comment API. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
