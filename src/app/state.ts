import type { GitHubIssueComment } from "../services/GitHubIssues.js"
import type { RepositoryCache } from "../features/repositories/model.js"

export interface AppState {
  repositoryCache: RepositoryCache | null
  repositoryRefreshInFlight: boolean
  readonly commentCache: Map<string, ReadonlyArray<GitHubIssueComment>>
  readonly commentRequests: Set<string>
}

export const createAppState = (): AppState => ({
  repositoryCache: null,
  repositoryRefreshInFlight: false,
  commentCache: new Map(),
  commentRequests: new Set(),
})
