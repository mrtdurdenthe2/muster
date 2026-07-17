import { Effect } from "effect"
import { appLayer, errorText } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import type { IssueDraft } from "./model.js"

const issueCreationStatusText = (repository: string): string => ` Creating issue in ${repository}... `

export const openIssueCreatorForSelectedRepository = (shell: AppShell): void => {
  const selectedOption = shell.issueList.getSelectedOption()
  if (!selectedOption) {
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

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listLabels(repository)
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (labels) => ({ _tag: "Success" as const, labels }),
      }),
    ),
  ).then((result) => {
    if (!shell.issueCreator.visible) return

    if (result._tag === "Failure") {
      shell.issueCreator.setMessage(`Unable to load labels: ${result.message}`)
      return
    }

    shell.issueCreator.setAvailableLabels(result.labels)
  })
}

export const createIssueFromDraft = (shell: AppShell, draft: IssueDraft): void => {
  const createMessage = issueCreationStatusText(draft.repository)
  shell.status.content = "Issue creator closed. Creating issue in the background..."
  shell.createStatus.content = createMessage
  shell.createStatus.width = createMessage.length
  shell.createStatus.visible = true
  shell.issueBackdrop.visible = false
  shell.issueCreator.close()
  shell.issueList.focus()

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.create(draft)
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
      }),
    ),
  ).then((result) => {
    shell.createStatus.visible = false

    if (result._tag === "Failure") {
      shell.status.content = "Unable to create issue."
      shell.details.setMessage(result.message)
      return
    }

    shell.status.content = `Created issue in ${draft.repository}. Press r to refresh.`
    shell.details.setMessage(result.result.url)
  })
}
