import type { SelectOption } from "@opentui/core"
import type { GitHubIssue, GitHubIssues } from "../../services/GitHubIssues.js"
import { formatDate, truncate } from "../../ui/text.js"

export interface IssueOptionValue {
  readonly issue: GitHubIssue
  readonly repository: string
}

export interface IssueOption extends SelectOption {
  readonly value: IssueOptionValue
}

export const issueToOption = (issue: GitHubIssue, issues: GitHubIssues): IssueOption => {
  const repository = issues.repositoryNameFromApiUrl(issue.repository_url)
  const labels = issue.labels.map((label) => label.name).join(", ")
  const descriptionParts = [`${repository} #${issue.number}`, `updated ${formatDate(issue.updated_at)}`]
  if (labels) descriptionParts.push(labels)

  return {
    name: truncate(issue.title, 90),
    description: descriptionParts.join(" · "),
    value: { issue, repository },
  }
}

export const issueOptionKey = (option: IssueOption): string => `${option.value.repository}#${option.value.issue.number}`
