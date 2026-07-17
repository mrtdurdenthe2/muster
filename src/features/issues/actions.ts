import { Effect } from "effect"
import { appLayer, errorText } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"
import { loadIssues } from "./queries.js"

export const expandSelectedIssue = (shell: AppShell): void => {
  if (!shell.issueList.getSelectedOption()) {
    shell.status.content = "Select an issue before expanding details."
    return
  }

  shell.issueList.visible = false
  shell.details.width = "100%"
  shell.details.setExpanded(true)
  shell.updateLayout()
  shell.footer.content =
    "Esc collapse issue · Ctrl+N Create issue in this repo · Ctrl+O Create issue in other repo · r to refresh · q to quit"
  shell.status.content = "Issue expanded."
}

export const collapseSelectedIssue = (shell: AppShell): void => {
  shell.issueList.visible = true
  shell.details.width = "auto"
  shell.details.setExpanded(false)
  shell.updateLayout()
  shell.footer.content =
    "↑/↓ or j/k to move · enter to select · Ctrl+N Create issue in this repo · Ctrl+O Create issue in other repo · r to refresh · q to quit"
  shell.status.content = "Issue list restored."
  shell.issueList.focus()
}

export const loadIssueComments = (shell: AppShell, state: AppState, option: IssueOption): void => {
  const key = issueOptionKey(option)
  const cached = state.commentCache.get(key)
  if (cached) {
    shell.details.setComments(key, cached)
    return
  }

  shell.details.setCommentsLoading(key)
  if (state.commentRequests.has(key)) return

  const value = option.value
  state.commentRequests.add(key)
  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listComments(value.repository, value.issue.number)
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (comments) => ({ _tag: "Success" as const, comments }),
      }),
    ),
  ).then((result) => {
    state.commentRequests.delete(key)
    if (result._tag === "Failure") {
      shell.details.setCommentsError(key, result.message)
      return
    }

    state.commentCache.set(key, result.comments)
    shell.details.setComments(key, result.comments)
  })
}

export const refreshIssues = (shell: AppShell): void => {
  shell.status.content = "Loading issues from GitHub CLI…"
  shell.details.setMessage("")

  Effect.runPromise(
    loadIssues.pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
      }),
    ),
  ).then((result) => {
    if (result._tag === "Failure") {
      shell.status.content = "Unable to load issues."
      shell.details.setMessage(result.message)
      return
    }

    shell.issueList.options = result.result.options
    shell.status.content = `${result.result.options.length} shown · ${result.result.total} total matches`
    shell.details.setOption(shell.issueList.getSelectedOption())
  })
}
