"use client";

import { createContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { ModuleRow, SignalRow } from "@wcc-impact/shared";

/** Everything the ONE core realtime subscription fans out (PLAN §7.3). */
export interface SignalStore {
  /** Newest first, capped at the provider's in-memory limit. */
  signals: SignalRow[];
  loading: boolean;
  error: string | null;
  /** The runtime module registry (tiles, health strip, enabled flags). */
  modules: ModuleRow[];
  modulesLoading: boolean;
  /** Supabase Auth state, provided by the same core shell context. */
  user: User | null;
  userLoading: boolean;
}

export const SignalContext = createContext<SignalStore | null>(null);

/** Readable failure when a hook is used outside the core shell. */
export function requireStore(store: SignalStore | null, hook: string): SignalStore {
  if (!store) {
    throw new Error(
      `@wcc-impact/plugin-sdk: ${hook} was called outside <SignalProvider>. ` +
        "The core dashboard shell mounts the provider — module pages rendered at " +
        "/modules/[id] always have it. Do not render SDK hooks outside the shell.",
    );
  }
  return store;
}
