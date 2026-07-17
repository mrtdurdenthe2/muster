import type { TabSelectOption } from "@opentui/core"
import type { IssueOption } from "./issueOption.js"

export interface YourIssuesTab {
  readonly id: "your-issues"
  readonly kind: "your-issues"
  readonly name: "Your issues"
}

export interface RepositoryIssuesTab {
  readonly id: string
  readonly kind: "repository"
  readonly name: string
  readonly repository: string
}

export type IssueTab = YourIssuesTab | RepositoryIssuesTab

export interface IssueTabResult {
  readonly total: number
  readonly options: ReadonlyArray<IssueOption>
  readonly incomplete: boolean
}

export const yourIssuesTab: YourIssuesTab = {
  id: "your-issues",
  kind: "your-issues",
  name: "Your issues",
}

export const repositoryIssuesTab = (repository: string): RepositoryIssuesTab => ({
  id: `repository:${repository.toLocaleLowerCase()}`,
  kind: "repository",
  name: repository,
  repository,
})

export const issueTabOption = (tab: IssueTab): TabSelectOption => ({
  name: tab.name,
  description: tab.kind === "your-issues" ? "Issues involving you" : `Recent issues in ${tab.repository}`,
  value: tab,
})
