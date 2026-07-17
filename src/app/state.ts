import type { GitHubIssueComment } from "../services/GitHubIssues.js"
import type { RepositoryCache } from "../features/repositories/model.js"
import { type IssueTab, type IssueTabResult, yourIssuesTab } from "../features/issues/issueTab.js"

export interface AppState {
  repositoryCache: RepositoryCache | null
  repositoryRefreshInFlight: boolean
  readonly commentCache: Map<string, ReadonlyArray<GitHubIssueComment>>
  readonly commentRequests: Set<string>
  readonly commentRequestVersions: Map<string, number>
  readonly issueTabs: IssueTab[]
  activeIssueTabIndex: number
  readonly issueRequestVersions: Map<string, number>
  readonly issueCache: Map<string, IssueTabResult>
  addIssueTabRequestVersion: number
  repositoryPickerTitle: string
  repositoryPickerPrompt: string
}

export const createAppState = (): AppState => ({
  repositoryCache: null,
  repositoryRefreshInFlight: false,
  commentCache: new Map(),
  commentRequests: new Set(),
  commentRequestVersions: new Map(),
  issueTabs: [yourIssuesTab],
  activeIssueTabIndex: 0,
  issueRequestVersions: new Map(),
  issueCache: new Map(),
  addIssueTabRequestVersion: 0,
  repositoryPickerTitle: "Make Issue in Other Repo",
  repositoryPickerPrompt: "Choose a repository for the new issue.",
})
