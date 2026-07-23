"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { WidgetSkeleton, type WidgetDisplayMode } from "@wcc-impact/plugin-sdk";
import type { RegisteredWidget } from "../../lib/widgets";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

export function WidgetMount({
  definition,
  instanceId,
  displayMode,
  config,
}: {
  definition: RegisteredWidget;
  instanceId: string;
  displayMode: WidgetDisplayMode;
  config: Readonly<Record<string, unknown>>;
}) {
  const WidgetBody = useMemo(
    () =>
      dynamic(definition.widget.ui, {
        ssr: false,
        loading: () => <WidgetSkeleton />,
      }),
    [definition.widget.ui],
  );

  return (
    <WidgetErrorBoundary
      key={`${definition.key}/${instanceId}`}
      instanceId={instanceId}
      moduleId={definition.module.id}
    >
      <WidgetBody
        instanceId={instanceId}
        moduleId={definition.module.id}
        widgetId={definition.widget.id}
        displayMode={displayMode}
        config={config}
      />
    </WidgetErrorBoundary>
  );
}
