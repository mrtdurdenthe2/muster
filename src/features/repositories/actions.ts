import { Effect } from "effect"
import { appLayer, errorText } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { normalizeOwnedRepositories, repositoryCacheFingerprint } from "./model.js"

export const openRepositoryPicker = (shell: AppShell, state: AppState): void => {
  shell.repositoryBackdrop.visible = true

  if (state.repositoryCache) {
    shell.status.content = "Showing cached repositories. Refreshing in the background."
    shell.repositoryPicker.openWithRepositories(state.repositoryCache.repositories, "Refreshing repositories...")
  } else {
    shell.status.content = "Loading owned repositories."
    shell.repositoryPicker.openLoading()
  }

  refreshOwnedRepositories(shell, state)
}

export const refreshOwnedRepositories = (shell: AppShell, state: AppState): void => {
  if (state.repositoryRefreshInFlight) return

  state.repositoryRefreshInFlight = true

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listOwnedRepositories()
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (repositories) => ({ _tag: "Success" as const, repositories }),
      }),
    ),
  ).then((result) => {
    state.repositoryRefreshInFlight = false

    if (result._tag === "Failure") {
      if (!shell.repositoryPicker.visible) return

      if (state.repositoryCache) {
        shell.status.content = "Showing cached repositories. Background refresh failed."
        shell.repositoryPicker.setMessage(`Unable to refresh repositories: ${result.message}`)
      } else {
        shell.status.content = "Unable to load owned repositories."
        shell.repositoryPicker.setMessage(`Unable to load repositories: ${result.message}`)
      }
      return
    }

    const repositories = normalizeOwnedRepositories(result.repositories)
    const fingerprint = repositoryCacheFingerprint(repositories)
    const changed = state.repositoryCache?.fingerprint !== fingerprint
    state.repositoryCache = { repositories, fingerprint }

    if (!shell.repositoryPicker.visible) return

    shell.status.content = "Choose a repository for the new issue."
    if (changed) {
      shell.repositoryPicker.setRepositories(repositories)
    } else {
      shell.repositoryPicker.setMessage("")
    }
  })
}
