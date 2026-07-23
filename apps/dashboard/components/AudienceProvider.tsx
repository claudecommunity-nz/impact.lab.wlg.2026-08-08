"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DashboardAudience = "public" | "operations";

interface AudienceContextValue {
  audience: DashboardAudience;
  setAudience: (audience: DashboardAudience) => void;
}

const STORAGE_KEY = "wcc-dashboard-audience";
const AudienceContext = createContext<AudienceContextValue | null>(null);

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [audience, setAudienceState] = useState<DashboardAudience>("public");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "public" || stored === "operations") {
      setAudienceState(stored);
    }
  }, []);

  const setAudience = useCallback((next: DashboardAudience) => {
    setAudienceState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ audience, setAudience }), [audience, setAudience]);

  return <AudienceContext.Provider value={value}>{children}</AudienceContext.Provider>;
}

export function useAudience(): AudienceContextValue {
  const value = useContext(AudienceContext);
  if (!value) {
    throw new Error("useAudience() must be used inside AudienceProvider");
  }
  return value;
}
