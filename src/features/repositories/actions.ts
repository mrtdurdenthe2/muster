import { Effect } from "effect"
import { appLayer, errorText, forkEffect } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { normalizeOwnedRepositories, repositoryCacheFingerprint } from "./model.js"

export interface RepositoryPickerCopy {
  readonly title: string
  readonly prompt: string
}

export const openRepositoryPicker = (shell: AppShell, state: AppState, copy: RepositoryPickerCopy): void => {
  state.addIssueTabRequestVersion++
  shell.repositoryBackdrop.visible = true
  state.repositoryPickerTitle = copy.title
  state.repositoryPickerPrompt = copy.prompt

  if (state.repositoryCache) {
    shell.status.content = "Showing cached repositories. Refreshing in the background."
    shell.repositoryPicker.openWithRepositories(
      state.repositoryCache.repositories,
      "Refreshing repositories...",
      state.repositoryPickerTitle,
    )
  } else {
    shell.status.content = "Loading owned repositories."
    shell.repositoryPicker.openLoading(state.repositoryPickerTitle)
  }

  refreshOwnedRepositories(shell, state)
}

export const refreshOwnedRepositories = (shell: AppShell, state: AppState): void => {
  if (state.repositoryRefreshInFlight) return

  state.repositoryRefreshInFlight = true

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listOwnedRepositories()
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        state.repositoryRefreshInFlight = false
        if (!shell.repositoryPicker.visible) return

        const message = errorText(error)
        if (state.repositoryCache) {
          shell.status.content = "Showing cached repositories. Background refresh failed."
          shell.repositoryPicker.setMessage(`Unable to refresh repositories: ${message}`)
        } else {
          shell.status.content = "Unable to load owned repositories."
          shell.repositoryPicker.setMessage(`Unable to load repositories: ${message}`)
        }
      },
      onSuccess: (result) => {
        state.repositoryRefreshInFlight = false
        const repositories = normalizeOwnedRepositories(result)
        const fingerprint = repositoryCacheFingerprint(repositories)
        const changed = state.repositoryCache?.fingerprint !== fingerprint
        state.repositoryCache = { repositories, fingerprint }

        if (!shell.repositoryPicker.visible) return

        shell.status.content = state.repositoryPickerPrompt
        if (changed) {
          shell.repositoryPicker.setRepositories(repositories)
        } else {
          shell.repositoryPicker.setMessage("")
        }
      },
    },
  )
}
