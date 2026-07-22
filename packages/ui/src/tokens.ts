import type { Severity } from "@wcc-impact/shared";

/**
 * Severity → hex colour, CAP-aligned. MUST stay in sync with the
 * --color-severity-* variables in tokens.css — map markers (inline styles)
 * and Tailwind utilities (bg-severity-severe) share this one scale.
 *
 * @example
 * import { SEVERITY_COLORS } from "@wcc-impact/plugin-sdk";
 * const dot = SEVERITY_COLORS["severe"]; // "#ea580c"
 */
export const SEVERITY_COLORS: Record<Severity, string> = {
  minor: "#2e9e4f",
  moderate: "#d97706",
  severe: "#ea580c",
  extreme: "#dc2626",
  unknown: "#64748b",
};

/**
 * Safe lookup: any unexpected/missing severity string falls back to "unknown".
 *
 * @example severityColor(signal.severity) // "#64748b" for undefined
 */
export function severityColor(severity: string | null | undefined): string {
  return SEVERITY_COLORS[(severity ?? "unknown") as Severity] ?? SEVERITY_COLORS.unknown;
}
