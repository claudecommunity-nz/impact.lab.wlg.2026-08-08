"use client";

import type { ReactNode } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  cn,
} from "@wcc-impact/ui";

/**
 * Standard body container for module widgets. The dashboard owns the outer
 * Card and header; widget code should start with this component.
 */
export function WidgetContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden p-3", className)}>
      {children}
    </div>
  );
}

/** Consistent empty state that remains usable in compact widget sizes. */
export function WidgetEmpty({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <Empty className={cn("h-full min-h-0 gap-2 border-0 p-4 md:p-5", className)}>
      <EmptyHeader>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

/** A shared large-number treatment for compact metric widgets. */
export function WidgetMetric({
  label,
  value,
  hint,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col justify-center gap-1", className)}>
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </div>
  );
}

/** Loading body used by both module code and the dashboard lazy boundary. */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-2 p-3" aria-label="Loading widget">
      <Skeleton className="h-7 w-24" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-5 w-full" />
      ))}
    </div>
  );
}
