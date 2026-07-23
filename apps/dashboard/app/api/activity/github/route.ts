import { NextResponse } from "next/server";

import {
  normalizeGitHubGraphql,
  normalizeGitHubRest,
  unavailableGitHubActivity,
} from "../../../../lib/activity/github";

export const dynamic = "force-dynamic";

const DEFAULT_REPOSITORY = "claudecommunity-nz/impact.lab.wlg.2026-08-08";
const CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=120";

const ACTIVITY_QUERY = `
  query LabActivity($owner: String!, $name: String!) {
    rateLimit { limit remaining resetAt }
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 25) {
              nodes {
                oid
                messageHeadline
                committedDate
                url
                author { name user { login avatarUrl } }
              }
            }
          }
        }
      }
      pullRequests(
        first: 20
        states: [OPEN, MERGED, CLOSED]
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          number
          title
          url
          state
          isDraft
          mergedAt
          updatedAt
          headRefName
          author { login avatarUrl }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  contexts(first: 50) {
                    nodes {
                      __typename
                      ... on CheckRun { name status conclusion detailsUrl }
                      ... on StatusContext { context state targetUrl }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function response(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: { "Cache-Control": CACHE_CONTROL } });
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const result = await fetch(url, init);
  if (!result.ok) {
    throw new Error(`GitHub returned ${result.status}`);
  }
  return result.json();
}

export async function GET() {
  const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    return response(
      unavailableGitHubActivity(
        repository,
        "GITHUB_REPOSITORY must use the owner/repository format.",
      ),
    );
  }

  const token = process.env.GITHUB_TOKEN;
  try {
    if (token) {
      const payload = await fetchJson("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "wcc-impact-lab-activity",
        },
        body: JSON.stringify({
          query: ACTIVITY_QUERY,
          variables: { owner, name },
        }),
      });
      const errors = (payload as { errors?: Array<{ message?: string }> }).errors;
      if (errors?.length) throw new Error(errors[0]?.message || "GitHub GraphQL query failed");
      return response(normalizeGitHubGraphql(payload, repository));
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wcc-impact-lab-activity",
    };
    const [commits, pulls] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repository}/commits?per_page=25`, { headers }),
      fetchJson(
        `https://api.github.com/repos/${repository}/pulls?state=all&sort=updated&direction=desc&per_page=20`,
        { headers },
      ),
    ]);
    return response(normalizeGitHubRest(commits, pulls, repository));
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "GitHub activity is unavailable";
    const message =
      !token && rawMessage.includes("403")
        ? "GitHub's public API allowance is exhausted. Configure the server-only GITHUB_TOKEN to restore commits, pull requests, and check status."
        : rawMessage;
    return response(unavailableGitHubActivity(repository, message));
  }
}
