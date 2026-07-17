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

const titleWords = (value: string): ReadonlyArray<string> => value.split(/[^\p{L}\p{N}_+#]+/u).filter(Boolean)

const titleHasTerm = (title: string, term: string): boolean => {
  const words = new Set(titleWords(title))
  const terms = titleWords(term)
  return terms.length > 0 && terms.every((value) => words.has(value))
}

export const issueMatchesSearch = (option: IssueOption, query: string): boolean => {
  const issue = option.value.issue
  const title = issue.title.toLocaleLowerCase()
  const author = issue.user.login.toLocaleLowerCase()
  const number = String(issue.number)
  const labels = issue.labels.map((label) => label.name.toLocaleLowerCase())
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)

  return tokens.every((token) => {
    const separator = token.indexOf(":")
    const field = separator === -1 ? "" : token.slice(0, separator)
    const value = separator === -1 ? token : token.slice(separator + 1)

    if (field === "name" || field === "title") return value.length > 0 && titleHasTerm(title, value)
    if (field === "author") return value.length > 0 && author === value.replace(/^@/, "")
    if (field === "number") return value.length > 0 && number === value.replace(/^#/, "")
    if (field === "tag" || field === "label") return value.length > 0 && labels.some((label) => label === value)

    if (/^#\d+$/.test(token)) return number === token.slice(1)
    if (/^\d+$/.test(token)) return number === token
    if (token.startsWith("@")) return author === token.slice(1)
    if (separator !== -1) return labels.some((label) => label === token)

    return titleHasTerm(title, token)
  })
}
