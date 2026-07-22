/**
 * Compact relative timestamp for feed cards and map popups.
 * "just now" / "4m ago" / "2h ago" / "3d ago", falling back to a local date
 * for anything older than a week or unparseable input.
 *
 * @example timeAgo("2026-08-08T02:15:00Z") // "12m ago" (at 02:27 UTC)
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
