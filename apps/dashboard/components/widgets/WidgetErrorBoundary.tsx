"use client";

import { Component, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle, Button } from "@wcc-impact/plugin-sdk";

interface Props {
  instanceId: string;
  moduleId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Per-instance isolation: one broken widget never takes down the dashboard. */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(
      `[widget:${this.props.moduleId}/${this.props.instanceId}] UI crashed:`,
      error,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center p-3">
        <Alert variant="destructive">
          <AlertTitle>This widget hit an error</AlertTitle>
          <AlertDescription>
            <span className="line-clamp-2">{this.state.error.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
}
