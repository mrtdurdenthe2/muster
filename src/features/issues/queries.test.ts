import { expect, test } from "bun:test"
import { Effect } from "effect"
import { GitHubIssues, type GitHubIssue } from "../../services/GitHubIssues.js"
import { nextIssueStateFilter, type RepositoryIssuesTab } from "./issueTab.js"
import { issueNumberFromSearch, repositoryIssueSearchQuery, searchRepositoryIssues } from "./queries.js"

const tab: RepositoryIssuesTab = {
  id: "repository:owner/repo",
  kind: "repository",
  name: "owner/repo",
  repository: "owner/repo",
}

const issue: GitHubIssue = {
  html_url: "https://github.com/owner/repo/issues/42",
  number: 42,
  title: "Fix startup crash",
  state: "open",
  repository_url: "https://api.github.com/repos/owner/repo",
  updated_at: "2026-07-17T00:00:00Z",
  labels: [{ name: "type:bug", color: "" }],
  body: null,
  user: { login: "alice" },
}

test("builds qualified repository search queries", () => {
  expect(repositoryIssueSearchQuery("owner/repo", "name:startup author:@alice tag:type:bug", "open")).toBe(
    'repo:owner/repo is:issue is:open "startup" author:alice label:"type:bug" in:title sort:updated-desc',
  )
  expect(repositoryIssueSearchQuery("owner/repo", "startup @alice type:bug", "closed")).toBe(
    'repo:owner/repo is:issue is:closed "startup" author:alice label:"type:bug" in:title sort:updated-desc',
  )
  expect(repositoryIssueSearchQuery("owner/repo", "startup", "all")).toBe(
    'repo:owner/repo is:issue "startup" in:title sort:updated-desc',
  )
})

test("cycles open, closed, and all issue states", () => {
  expect(nextIssueStateFilter("open")).toBe("closed")
  expect(nextIssueStateFilter("closed")).toBe("all")
  expect(nextIssueStateFilter("all")).toBe("open")
})

test("extracts exact issue numbers", () => {
  expect(issueNumberFromSearch("#42")).toBe(42)
  expect(issueNumberFromSearch("author:alice number:#7")).toBe(7)
  expect(issueNumberFromSearch("name:42")).toBeNull()
})

test("exact number search fetches the issue directly", async () => {
  const requestedIssues: number[] = []
  const service = {
    getIssue: (_repository: string, issueNumber: number) => {
      requestedIssues.push(issueNumber)
      return Effect.succeed(issue)
    },
    repositoryNameFromApiUrl: () => "owner/repo",
  } as unknown as GitHubIssues

  const result = await Effect.runPromise(
    searchRepositoryIssues(tab, "number:42 author:alice", "open").pipe(Effect.provideService(GitHubIssues, service)),
  )

  expect(requestedIssues).toEqual([42])
  expect(result.options).toHaveLength(1)
  expect(result.options[0]?.value.issue.number).toBe(42)

  const closedResult = await Effect.runPromise(
    searchRepositoryIssues(tab, "number:42", "closed").pipe(Effect.provideService(GitHubIssues, service)),
  )
  expect(closedResult.options).toHaveLength(0)
})
