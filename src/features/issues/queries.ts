import { Effect } from "effect"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { issueMatchesSearch, issueToOption, type IssueOption } from "./issueOption.js"
import type { IssueTab, IssueTabResult, RepositoryIssuesTab } from "./issueTab.js"

const sortIssueOptions = (options: ReadonlyArray<IssueOption>): ReadonlyArray<IssueOption> =>
  [...options].sort((left, right) => {
    const leftValue = left.value
    const rightValue = right.value
    return (
      leftValue.repository.localeCompare(rightValue.repository) ||
      rightValue.issue.updated_at.localeCompare(leftValue.issue.updated_at)
    )
  })

export const issueNumberFromSearch = (query: string): number | null => {
  for (const token of query.trim().split(/\s+/)) {
    const match = /^(?:number:)?#?(\d+)$/i.exec(token)
    if (match?.[1]) return Number(match[1])
  }
  return null
}

const quoteSearchValue = (value: string): string => `"${value.replace(/["\\]/g, "\\$&")}"`

export const repositoryIssueSearchQuery = (repository: string, query: string): string => {
  const terms: string[] = []
  const qualifiers: string[] = []

  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const separator = token.indexOf(":")
    const field = separator === -1 ? "" : token.slice(0, separator).toLocaleLowerCase()
    const value = separator === -1 ? token : token.slice(separator + 1)
    if (!value || field === "number" || /^(?:#)?\d+$/.test(token)) continue

    if (!field && value.startsWith("@")) {
      qualifiers.push(`author:${value.slice(1)}`)
    } else if (field === "name" || field === "title") {
      terms.push(quoteSearchValue(value))
    } else if (field === "author") {
      qualifiers.push(`author:${value.replace(/^@/, "")}`)
    } else if (field === "tag" || field === "label") {
      qualifiers.push(`label:${quoteSearchValue(value)}`)
    } else if (separator !== -1) {
      qualifiers.push(`label:${quoteSearchValue(token)}`)
    } else {
      terms.push(quoteSearchValue(token))
    }
  }

  if (terms.length > 0) qualifiers.push("in:title")
  return [`repo:${repository}`, "is:issue", ...terms, ...qualifiers, "sort:updated-desc"].join(" ")
}

export const loadIssues = (tab: IssueTab) =>
  Effect.gen(function* () {
    const issues = yield* GitHubIssues
    const response = yield* issues.searchAssigned({
      query: tab.kind === "your-issues" ? undefined : `repo:${tab.repository} is:issue sort:updated-desc`,
      limit: tab.kind === "your-issues" ? 50 : 100,
    })
    const options = sortIssueOptions(response.items.map((issue) => issueToOption(issue, issues)))

    return {
      total: response.total_count,
      options,
      incomplete: response.incomplete_results,
    } satisfies IssueTabResult
  })

export const searchRepositoryIssues = (tab: RepositoryIssuesTab, query: string) =>
  Effect.gen(function* () {
    const issues = yield* GitHubIssues
    const issueNumber = issueNumberFromSearch(query)
    if (issueNumber !== null) {
      const issue = yield* issues.getIssue(tab.repository, issueNumber).pipe(
        Effect.map((issue) => issue as typeof issue | null),
        Effect.catchTag("CommandError", (error) =>
          /(?:HTTP 404|Not Found)/i.test(error.detail) ? Effect.succeed(null) : Effect.fail(error),
        ),
      )
      const option = issue && issue.pull_request === undefined ? issueToOption(issue, issues) : null
      const options = option && issueMatchesSearch(option, query) ? [option] : []
      return { total: options.length, options, incomplete: false } satisfies IssueTabResult
    }

    const response = yield* issues.searchAssigned({
      query: repositoryIssueSearchQuery(tab.repository, query),
      limit: 100,
    })
    const options = sortIssueOptions(
      response.items.map((issue) => issueToOption(issue, issues)).filter((option) => issueMatchesSearch(option, query)),
    )
    return {
      total: response.total_count,
      options,
      incomplete: response.incomplete_results,
    } satisfies IssueTabResult
  })
