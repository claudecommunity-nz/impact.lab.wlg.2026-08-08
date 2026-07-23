"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@wcc-impact/plugin-sdk";

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/**
 * Compact segmented System / Light / Dark switch for the sidebar footer.
 * Renders a placeholder until mounted to avoid a hydration mismatch (the
 * resolved theme isn't known on the server).
 */
export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex min-h-11 items-center gap-0.5 rounded-md border border-sidebar-border bg-sidebar p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center rounded-[5px] motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
              active
                ? "bg-sidebar-accent text-white"
                : "text-slate-400 hover:bg-sidebar-accent/70 hover:text-white",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
