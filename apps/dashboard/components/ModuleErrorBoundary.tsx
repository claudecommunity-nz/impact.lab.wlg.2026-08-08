"use client";

import { Component, type ReactNode } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@wcc-impact/plugin-sdk";

interface Props {
  moduleId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Per-module error boundary (PLAN §3.2): a crashing module UI shows a friendly
 * card on its own page while the map, feed and every other module stay up.
 * Mount with key={moduleId} so navigating between modules resets it.
 *
 * @example
 * <ModuleErrorBoundary key={id} moduleId={id}><ModuleUi /></ModuleErrorBoundary>
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Log for the team debugging their own module; nothing else needs this.
    console.error(`[module:${this.props.moduleId}] UI crashed:`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Card className="m-6 gap-0 overflow-hidden border-destructive/40 py-0">
        <CardHeader className="border-b border-destructive/30 bg-destructive/10 py-4">
          <CardTitle className="text-lg font-semibold text-foreground">
            This module&apos;s page hit an error
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-muted-foreground">
            Only <code>{this.props.moduleId}</code> is affected — the map, feed and other
            modules are still running. Check the browser console, fix the component, and
            fast refresh will pick it up.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-destructive">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button type="button" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            {/* React.lazy caches a rejected chunk import, so a plain state reset
                can't recover from a failed module bundle load — offer the reload. */}
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
