export type ActivitySourceName = "github" | "supabase";
export type ActivitySourceStatus = "ok" | "degraded" | "unavailable";

export interface ActivitySourceHealth {
  source: ActivitySourceName;
  status: ActivitySourceStatus;
  fetchedAt: string;
  message?: string;
}

export interface CheckSummary {
  state: "success" | "pending" | "failure" | "unknown";
  total: number;
  passed: number;
  pending: number;
  failed: number;
}

export interface GitHubCommitActivity {
  sha: string;
  message: string;
  author: string;
  avatarUrl: string | null;
  url: string;
  committedAt: string;
}

export interface GitHubPullRequestActivity {
  number: number;
  title: string;
  url: string;
  state: "open" | "merged" | "closed";
  draft: boolean;
  author: string;
  avatarUrl: string | null;
  branch: string;
  updatedAt: string;
  mergedAt: string | null;
  checks: CheckSummary;
}

export interface GitHubActivity {
  source: ActivitySourceHealth;
  repository: string;
  repositoryUrl: string;
  commits: GitHubCommitActivity[];
  pullRequests: GitHubPullRequestActivity[];
  rateLimit: {
    limit: number | null;
    remaining: number | null;
    resetAt: string | null;
  };
}

export interface SupabaseModuleActivity {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  enabled: boolean;
  lastSeen: string | null;
  updatedAt: string;
  signalCount: number | null;
  declaredTables: string[];
}

export interface SupabaseSignalActivity {
  id: string;
  createdAt: string;
  title: string;
  signalType: string;
  moduleId: string;
  sourceType: string;
  severity: string;
  verification: string;
}

export interface SupabaseTableActivity {
  moduleId: string;
  logicalName: string;
  physicalName: string;
  count: number | null;
  rows: Record<string, unknown>[];
  error?: string;
}

export interface SupabaseMediaActivity {
  moduleId: string;
  name: string;
  createdAt: string | null;
  size: number | null;
  mimeType: string | null;
  publicUrl: string;
}

export interface SupabaseActivity {
  source: ActivitySourceHealth;
  totals: {
    registeredModules: number;
    enabledModules: number;
    signals: number | null;
    declaredTables: number;
    previewedMedia: number;
  };
  modules: SupabaseModuleActivity[];
  recentSignals: SupabaseSignalActivity[];
  tables: SupabaseTableActivity[];
  recentMedia: SupabaseMediaActivity[];
}

