import { Effect } from "effect"
import { appLayer, errorText, forkEffect } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { repositoryIssuesTab, yourIssuesTab } from "../issues/issueTab.js"
import type { IssueDraft } from "./model.js"

const issueCreationStatusText = (repository: string): string => ` Creating issue in ${repository}... `

export const openIssueCreatorForSelectedRepository = (shell: AppShell, fallbackRepository?: string): void => {
  const selectedOption = shell.issueList.getSelectedOption()
  if (!selectedOption) {
    if (fallbackRepository) {
      openIssueCreatorForRepository(shell, fallbackRepository)
      return
    }
    shell.status.content = "Select a repository issue before creating a new issue."
    return
  }

  openIssueCreatorForRepository(shell, selectedOption.value.repository)
}

export const openIssueCreatorForRepository = (shell: AppShell, repository: string): void => {
  shell.status.content = `Creating a new issue in ${repository}.`
  shell.issueBackdrop.visible = true
  shell.issueCreator.open(repository)
  shell.issueCreator.setMessage("Loading labels...")

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listLabels(repository)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        if (shell.issueCreator.isOpenForRepository(repository)) {
          shell.issueCreator.setMessage(`Unable to load labels: ${errorText(error)}`)
        }
      },
      onSuccess: (labels) => {
        if (shell.issueCreator.isOpenForRepository(repository)) shell.issueCreator.setAvailableLabels(labels)
      },
    },
  )
}

export const createIssueFromDraft = (shell: AppShell, state: AppState, draft: IssueDraft): void => {
  const sourceTabID = state.issueTabs[state.activeIssueTabIndex]?.id
  const createMessage = issueCreationStatusText(draft.repository)
  shell.status.content = "Issue creator closed. Creating issue in the background..."
  shell.createStatus.content = createMessage
  shell.createStatus.width = createMessage.length
  shell.createStatus.visible = true
  shell.issueBackdrop.visible = false
  shell.issueCreator.close()
  shell.focusMain()

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.create(draft)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        shell.createStatus.visible = false
        shell.status.content = "Unable to create issue."
        if (state.issueTabs[state.activeIssueTabIndex]?.id === sourceTabID) shell.details.setMessage(errorText(error))
      },
      onSuccess: (result) => {
        shell.createStatus.visible = false
        for (const tabID of [yourIssuesTab.id, repositoryIssuesTab(draft.repository).id]) {
          state.issueRequestVersions.set(tabID, (state.issueRequestVersions.get(tabID) ?? 0) + 1)
        }
        state.issueCache.delete(yourIssuesTab.id)
        state.issueCache.delete(repositoryIssuesTab(draft.repository).id)
        shell.status.content = `Created issue in ${draft.repository}. Press r to refresh.`
        if (state.issueTabs[state.activeIssueTabIndex]?.id === sourceTabID) shell.details.setMessage(result.url)
      },
    },
  )
}
