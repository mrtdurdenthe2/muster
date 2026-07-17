import { Effect } from "effect"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { issueToOption } from "./issueOption.js"
import type { IssueTab, IssueTabResult } from "./issueTab.js"

export const loadIssues = (tab: IssueTab) =>
  Effect.gen(function* () {
    const issues = yield* GitHubIssues
    const response = yield* issues.searchAssigned({
      query: tab.kind === "your-issues" ? undefined : `repo:${tab.repository} is:issue sort:updated-desc`,
      limit: tab.kind === "your-issues" ? 50 : 100,
    })
    const options = response.items
      .map((issue) => issueToOption(issue, issues))
      .sort((left, right) => {
        const leftValue = left.value
        const rightValue = right.value
        return (
          leftValue.repository.localeCompare(rightValue.repository) ||
          rightValue.issue.updated_at.localeCompare(leftValue.issue.updated_at)
        )
      })

    return {
      total: response.total_count,
      options,
      incomplete: response.incomplete_results,
    } satisfies IssueTabResult
  })
