import type { GitHubRepository } from "../../services/GitHubIssues.js"

export interface RepositoryCache {
  readonly repositories: ReadonlyArray<GitHubRepository>
  readonly fingerprint: string
}

export const normalizeOwnedRepositories = (
  repositories: ReadonlyArray<GitHubRepository>,
): ReadonlyArray<GitHubRepository> =>
  [...repositories]
    .filter((repository) => !repository.archived)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))

export const repositoryCacheFingerprint = (repositories: ReadonlyArray<GitHubRepository>): string =>
  JSON.stringify(
    repositories.map((repository) => ({
      full_name: repository.full_name,
      private: repository.private,
      updated_at: repository.updated_at,
    })),
  )
