import type { Severity, SourceType, Verification } from "./signal";

export interface ModuleSignalTypeCount {
  moduleId: string;
  signalType: string;
  count: number;
}

/** Exact database summary for enabled modules; independent of the 500-row store. */
export interface SignalAggregates {
  generatedAt: string;
  newestCreatedAt: string | null;
  total: number;
  active60m: number;
  new15m: number;
  previous15m: number;
  officialActive60m: number;
  distinctPlaces: number;
  bySeverity: Record<Severity, number>;
  bySource: Record<SourceType, number>;
  byVerification: Record<Verification, number>;
  byModule: Record<string, number>;
  moduleSignalTypes: ModuleSignalTypeCount[];
}

export interface SignalCursor {
  createdAt: string;
  id: string;
}

export interface SignalPage {
  signals: import("./signal").SignalRow[];
  nextCursor: SignalCursor | null;
  hasMore: boolean;
  fetchedAt: string;
}
