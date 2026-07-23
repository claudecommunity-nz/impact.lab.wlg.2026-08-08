import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGitHubGraphql,
  normalizeGitHubRest,
  unavailableGitHubActivity,
} from "./github";

test("normalizes commits, pull requests, and mixed check contexts", () => {
  const activity = normalizeGitHubGraphql(
    {
      data: {
        rateLimit: { limit: 5000, remaining: 4990, resetAt: "2026-08-08T01:00:00Z" },
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                nodes: [
                  {
                    oid: "abc123",
                    messageHeadline: "feat: add team module",
                    committedDate: "2026-08-08T00:00:00Z",
                    url: "https://github.test/commit/abc123",
                    author: { name: "Ada", user: { login: "ada", avatarUrl: "avatar" } },
                  },
                ],
              },
            },
          },
          pullRequests: {
            nodes: [
              {
                number: 12,
                title: "Team flood map",
                url: "https://github.test/pull/12",
                state: "OPEN",
                isDraft: false,
                mergedAt: null,
                updatedAt: "2026-08-08T00:01:00Z",
                headRefName: "team-flood-map",
                author: { login: "ada", avatarUrl: "avatar" },
                commits: {
                  nodes: [
                    {
                      commit: {
                        statusCheckRollup: {
                          contexts: {
                            nodes: [
                              {
                                __typename: "CheckRun",
                                name: "typecheck",
                                status: "COMPLETED",
                                conclusion: "SUCCESS",
                              },
                              {
                                __typename: "StatusContext",
                                context: "Vercel",
                                state: "PENDING",
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    "org/repo",
    "2026-08-08T00:02:00Z",
  );

  assert.equal(activity.source.status, "ok");
  assert.equal(activity.commits[0]?.author, "ada");
  assert.deepEqual(activity.pullRequests[0]?.checks, {
    state: "pending",
    total: 2,
    passed: 1,
    pending: 1,
    failed: 0,
  });
  assert.equal(activity.rateLimit.remaining, 4990);
});

test("public REST fallback is explicitly degraded when check status is unavailable", () => {
  const activity = normalizeGitHubRest([], [], "org/repo", "2026-08-08T00:00:00Z");
  assert.equal(activity.source.status, "degraded");
  assert.match(activity.source.message ?? "", /check status is unavailable/);
});

test("GitHub failure produces a renderable unavailable source", () => {
  const activity = unavailableGitHubActivity("org/repo", "rate limited", "2026-08-08T00:00:00Z");
  assert.equal(activity.source.status, "unavailable");
  assert.equal(activity.commits.length, 0);
  assert.equal(activity.source.message, "rate limited");
});

