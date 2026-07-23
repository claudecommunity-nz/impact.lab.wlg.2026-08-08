"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GripHorizontal,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ModuleIcon,
  cn,
} from "@wcc-impact/plugin-sdk";

type Direction = "left" | "right" | "up" | "down";
type ResizeDirection = "larger" | "smaller";

export function WidgetShell({
  title,
  moduleName,
  icon,
  editing,
  unavailable,
  canMove,
  canResize,
  children,
  onRemove,
  onMove,
  onResize,
}: {
  title: string;
  moduleName: string;
  icon?: string;
  editing: boolean;
  unavailable?: boolean;
  canMove: Record<Direction, boolean>;
  canResize: Record<ResizeDirection, boolean>;
  children: ReactNode;
  onRemove: () => void;
  onMove: (direction: Direction) => void;
  onResize: (direction: ResizeDirection) => void;
}) {
  return (
    <Card
      className={cn(
        "ops-panel h-full gap-0 overflow-hidden rounded-lg py-0 transition-[border-color,box-shadow] hover:shadow-md",
        editing && "border-primary/60 ring-1 ring-primary/20",
        unavailable && "border-dashed",
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/15 px-2.5">
        {editing && (
          <button
            type="button"
            className="widget-drag-handle flex size-7 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            aria-label={`Drag ${title}`}
            title="Drag widget"
          >
            <GripHorizontal className="size-4" />
          </button>
        )}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ModuleIcon name={icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </h2>
          <p className="truncate text-[10px] text-muted-foreground">{moduleName}</p>
        </div>
        {unavailable && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            unavailable
          </span>
        )}
        {editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move widget</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canMove.up}
                onSelect={() => onMove("up")}
              >
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMove.down}
                onSelect={() => onMove("down")}
              >
                <ArrowDown /> Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMove.left}
                onSelect={() => onMove("left")}
              >
                <ArrowLeft /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMove.right}
                onSelect={() => onMove("right")}
              >
                <ArrowRight /> Move right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canResize.larger}
                onSelect={() => onResize("larger")}
              >
                <Maximize2 /> Make larger
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canResize.smaller}
                onSelect={() => onResize("smaller")}
              >
                <Minimize2 /> Make smaller
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </Card>
  );
}
