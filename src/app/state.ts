import type { GitHubIssueComment } from "../services/GitHubIssues.js"
import type { RepositoryCache } from "../features/repositories/model.js"
import {
  type IssueStateFilter,
  type IssueTab,
  type IssueTabResult,
  yourIssuesTab,
} from "../features/issues/issueTab.js"

export interface AppState {
  repositoryCache: RepositoryCache | null
  repositoryRefreshInFlight: boolean
  readonly commentCache: Map<string, ReadonlyArray<GitHubIssueComment>>
  readonly commentRequests: Set<string>
  readonly commentRequestVersions: Map<string, number>
  readonly issueStateRequests: Set<string>
  readonly issueTabs: IssueTab[]
  activeIssueTabIndex: number
  issueStateFilter: IssueStateFilter
  readonly issueRequestVersions: Map<string, number>
  readonly issueCache: Map<string, IssueTabResult>
  issueSearchRequestVersion: number
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
  issueStateRequests: new Set(),
  issueTabs: [yourIssuesTab],
  activeIssueTabIndex: 0,
  issueStateFilter: "open",
  issueRequestVersions: new Map(),
  issueCache: new Map(),
  issueSearchRequestVersion: 0,
  addIssueTabRequestVersion: 0,
  repositoryPickerTitle: "Add Repository Tab",
  repositoryPickerPrompt: "Choose a repository to add as a tab.",
})
