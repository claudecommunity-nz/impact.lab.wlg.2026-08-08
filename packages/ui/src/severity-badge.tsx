import type { ReactElement } from "react";
import { Badge } from "./components/ui/badge";
import { cn } from "./lib/utils";
import { severityColor } from "./tokens";

/**
 * Small severity pill used by feed cards. Built on the shadcn <Badge>, but its
 * colour is data-driven (the shared, fixed severity scale) so the fill is set
 * with an inline style from SEVERITY_COLORS rather than a brand token — never
 * recolour it to the WCC palette.
 *
 * @example <SeverityBadge severity="severe" />
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: string | null | undefined;
  className?: string;
}): ReactElement {
  const label = severity ?? "unknown";
  return (
    <Badge
      className={cn(
        "border-transparent text-white uppercase tracking-wide",
        className,
      )}
      style={{ backgroundColor: severityColor(severity) }}
    >
      {label}
    </Badge>
  );
}
