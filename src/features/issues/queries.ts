import { Effect } from "effect"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { issueToOption } from "./issueOption.js"

export const loadIssues = Effect.gen(function* () {
  const issues = yield* GitHubIssues
  const response = yield* issues.searchAssigned({ limit: 50 })
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
  }
})
