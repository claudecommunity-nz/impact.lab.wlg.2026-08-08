"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme provider (next-themes, class strategy). Defaults to dark — the ops
 * dashboard lives on a big screen in a dim room — with a System/Light/Dark
 * toggle in the sidebar. Sets `class="dark"|"light"` on <html>, which drives
 * the token overrides in @wcc-impact/ui/tokens.css.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
