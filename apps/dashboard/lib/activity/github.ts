import type {
  CheckSummary,
  GitHubActivity,
  GitHubCommitActivity,
  GitHubPullRequestActivity,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const UNKNOWN_CHECKS: CheckSummary = {
  state: "unknown",
  total: 0,
  passed: 0,
  pending: 0,
  failed: 0,
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function checkSummary(contexts: unknown): CheckSummary {
  let passed = 0;
  let pending = 0;
  let failed = 0;

  for (const context of records(contexts)) {
    const typename = text(context.__typename);
    if (typename === "CheckRun") {
      const status = text(context.status).toUpperCase();
      const conclusion = text(context.conclusion).toUpperCase();
      if (status !== "COMPLETED" || !conclusion) pending++;
      else if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion)) passed++;
      else failed++;
    } else if (typename === "StatusContext") {
      const state = text(context.state).toUpperCase();
      if (state === "SUCCESS") passed++;
      else if (state === "PENDING" || state === "EXPECTED") pending++;
      else if (state) failed++;
    }
  }

  const total = passed + pending + failed;
  return {
    state: failed > 0 ? "failure" : pending > 0 ? "pending" : total > 0 ? "success" : "unknown",
    total,
    passed,
    pending,
    failed,
  };
}

function pullRequestState(value: unknown): "open" | "merged" | "closed" {
  const state = text(value).toUpperCase();
  if (state === "OPEN") return "open";
  if (state === "MERGED") return "merged";
  return "closed";
}

export function unavailableGitHubActivity(
  repository: string,
  message: string,
  fetchedAt = new Date().toISOString(),
): GitHubActivity {
  return {
    source: { source: "github", status: "unavailable", fetchedAt, message },
    repository,
    repositoryUrl: `https://github.com/${repository}`,
    commits: [],
    pullRequests: [],
    rateLimit: { limit: null, remaining: null, resetAt: null },
  };
}

export function normalizeGitHubGraphql(
  payload: unknown,
  repository: string,
  fetchedAt = new Date().toISOString(),
): GitHubActivity {
  const root = record(payload);
  const data = record(root.data);
  const repo = record(data.repository);
  const defaultBranch = record(repo.defaultBranchRef);
  const target = record(defaultBranch.target);
  const history = record(target.history);
  const commitNodes = records(history.nodes);
  const prConnection = record(repo.pullRequests);
  const prNodes = records(prConnection.nodes);
  const rateLimit = record(data.rateLimit);

  const commits: GitHubCommitActivity[] = commitNodes.map((node) => {
    const author = record(node.author);
    const user = record(author.user);
    return {
      sha: text(node.oid),
      message: text(node.messageHeadline, "(no commit message)"),
      author: text(user.login, text(author.name, "Unknown contributor")),
      avatarUrl: text(user.avatarUrl) || null,
      url: text(node.url),
      committedAt: text(node.committedDate),
    };
  });

  const pullRequests: GitHubPullRequestActivity[] = prNodes.map((node) => {
    const author = record(node.author);
    const commitsConnection = record(node.commits);
    const commitNode = records(commitsConnection.nodes).at(-1) ?? {};
    const commit = record(commitNode.commit);
    const rollup = record(commit.statusCheckRollup);
    const contexts = record(rollup.contexts);
    return {
      number: number(node.number) ?? 0,
      title: text(node.title, "(untitled pull request)"),
      url: text(node.url),
      state: pullRequestState(node.state),
      draft: node.isDraft === true,
      author: text(author.login, "Unknown contributor"),
      avatarUrl: text(author.avatarUrl) || null,
      branch: text(node.headRefName),
      updatedAt: text(node.updatedAt),
      mergedAt: text(node.mergedAt) || null,
      checks: checkSummary(contexts.nodes),
    };
  });

  return {
    source: { source: "github", status: "ok", fetchedAt },
    repository,
    repositoryUrl: `https://github.com/${repository}`,
    commits,
    pullRequests,
    rateLimit: {
      limit: number(rateLimit.limit),
      remaining: number(rateLimit.remaining),
      resetAt: text(rateLimit.resetAt) || null,
    },
  };
}

export function normalizeGitHubRest(
  commitsPayload: unknown,
  pullsPayload: unknown,
  repository: string,
  fetchedAt = new Date().toISOString(),
): GitHubActivity {
  const commits: GitHubCommitActivity[] = records(commitsPayload).map((node) => {
    const commit = record(node.commit);
    const authorDetails = record(commit.author);
    const author = record(node.author);
    return {
      sha: text(node.sha),
      message: text(commit.message, "(no commit message)").split("\n")[0] ?? "(no commit message)",
      author: text(author.login, text(authorDetails.name, "Unknown contributor")),
      avatarUrl: text(author.avatar_url) || null,
      url: text(node.html_url),
      committedAt: text(authorDetails.date),
    };
  });

  const pullRequests: GitHubPullRequestActivity[] = records(pullsPayload).map((node) => {
    const author = record(node.user);
    const head = record(node.head);
    return {
      number: number(node.number) ?? 0,
      title: text(node.title, "(untitled pull request)"),
      url: text(node.html_url),
      state: node.merged_at ? "merged" : pullRequestState(node.state),
      draft: node.draft === true,
      author: text(author.login, "Unknown contributor"),
      avatarUrl: text(author.avatar_url) || null,
      branch: text(head.ref),
      updatedAt: text(node.updated_at),
      mergedAt: text(node.merged_at) || null,
      checks: { ...UNKNOWN_CHECKS },
    };
  });

  return {
    source: {
      source: "github",
      status: "degraded",
      fetchedAt,
      message:
        "GITHUB_TOKEN is not configured, so public commits and pull requests are visible but check status is unavailable.",
    },
    repository,
    repositoryUrl: `https://github.com/${repository}`,
    commits,
    pullRequests,
    rateLimit: { limit: 60, remaining: null, resetAt: null },
  };
}

