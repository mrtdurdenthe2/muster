import { Effect } from "effect"
import { appLayer, errorText } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import type { CommentDraft } from "./commentDraft.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"
import { issueTabOption, repositoryIssuesTab, type IssueTab, type IssueTabResult } from "./issueTab.js"
import { loadIssues, searchRepositoryIssues } from "./queries.js"

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
    "j/k or arrows scroll · PgUp/PgDn · c comment · Tab switch · Esc collapse · n new issue · r refresh · q quit"
  shell.status.content = "Issue expanded."
}

export const collapseSelectedIssue = (shell: AppShell): void => {
  shell.issueList.visible = true
  shell.details.width = "auto"
  shell.details.setExpanded(false)
  shell.updateLayout()
  shell.footer.content =
    "Tab switch · / search · c comment · a add repo · ↑/↓ or j/k move · enter expand · n new issue · o other repo · r refresh · q quit"
  shell.status.content = "Issue list restored."
  shell.issueList.focus()
}

const requestIssueComments = (shell: AppShell, state: AppState, option: IssueOption, force: boolean): void => {
  const key = issueOptionKey(option)
  const cached = state.commentCache.get(key)
  if (cached && !force) {
    shell.details.setComments(key, cached)
    return
  }

  shell.details.setCommentsLoading(key)
  if (state.commentRequests.has(key) && !force) return

  const value = option.value
  const requestVersion = (state.commentRequestVersions.get(key) ?? 0) + 1
  state.commentRequestVersions.set(key, requestVersion)
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
    if (requestVersion !== state.commentRequestVersions.get(key)) return
    state.commentRequests.delete(key)
    if (result._tag === "Failure") {
      shell.details.setCommentsError(key, result.message)
      return
    }

    state.commentCache.set(key, result.comments)
    shell.details.setComments(key, result.comments)
  })
}

export const loadIssueComments = (shell: AppShell, state: AppState, option: IssueOption): void => {
  requestIssueComments(shell, state, option, false)
}

export const openCommentComposer = (shell: AppShell): void => {
  const option = shell.issueList.getSelectedOption()
  if (!option) {
    shell.status.content = "Select an issue before adding a comment."
    return
  }

  shell.issueBackdrop.visible = true
  shell.commentComposer.open(option)
  shell.status.content = `Adding a comment to ${option.value.repository} #${option.value.issue.number}.`
}

export const createCommentFromDraft = (shell: AppShell, state: AppState, draft: CommentDraft): void => {
  const key = issueOptionKey(draft.option)
  const value = draft.option.value
  shell.commentComposer.setSubmitting(true)

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.createComment(value.repository, value.issue.number, draft.body)
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (comment) => ({ _tag: "Success" as const, comment }),
      }),
    ),
  ).then((result) => {
    if (result._tag === "Failure") {
      shell.status.content = "Unable to add comment."
      if (shell.commentComposer.isOpenFor(draft.option)) shell.commentComposer.setMessage(result.message)
      return
    }

    state.commentRequestVersions.set(key, (state.commentRequestVersions.get(key) ?? 0) + 1)
    state.commentRequests.delete(key)
    const cached = state.commentCache.get(key)
    if (cached) {
      const comments = [...cached.filter((comment) => comment.id !== result.comment.id), result.comment]
      state.commentCache.set(key, comments)
      shell.details.setComments(key, comments)
    } else {
      requestIssueComments(shell, state, draft.option, true)
    }

    shell.commentComposer.close()
    shell.issueBackdrop.visible = false
    shell.status.content = `Comment added to ${value.repository} #${value.issue.number}.`
    shell.focusMain()
  })
}

const activeIssueTab = (state: AppState): IssueTab => state.issueTabs[state.activeIssueTabIndex] ?? state.issueTabs[0]

const repositoryFailureText = (repository: string, message: string): string =>
  /(?:Not Found|HTTP 404)/.test(message)
    ? `Check that ${repository} exists and that you have access to it.`
    : message

const showIssueTabResult = (shell: AppShell, tab: IssueTab, result: IssueTabResult): void => {
  shell.issueList.options = result.options
  shell.status.content =
    tab.kind === "your-issues"
      ? `${result.options.length} shown · ${result.total} total matches${result.incomplete ? " · partial GitHub result" : ""}`
      : result.options.length < result.total
        ? `${result.options.length} most recently updated · ${result.total} total issues in ${tab.repository}${result.incomplete ? " · partial GitHub result" : ""}`
        : `${result.total} issues in ${tab.repository}${result.incomplete ? " · partial GitHub result" : ""}`
  shell.details.setOption(shell.issueList.getSelectedOption())
}

export const searchIssues = (shell: AppShell, state: AppState, query: string): void => {
  const tab = activeIssueTab(state)
  const normalizedQuery = query.trim()
  const requestVersion = ++state.issueSearchRequestVersion

  if (!normalizedQuery) {
    const cached = state.issueCache.get(tab.id)
    if (cached) showIssueTabResult(shell, tab, cached)
    return
  }

  if (tab.kind === "your-issues") {
    shell.status.content = `${shell.issueList.options.length} matching loaded issues`
    return
  }

  const cached = state.issueCache.get(tab.id)
  if (cached) shell.issueList.options = cached.options
  shell.status.content = `Searching all issues in ${tab.repository}…`
  Effect.runPromise(
    Effect.sleep("300 millis").pipe(
      Effect.flatMap(() =>
        requestVersion !== state.issueSearchRequestVersion ||
        activeIssueTab(state).id !== tab.id ||
        shell.issueList.query.trim() !== normalizedQuery
          ? Effect.succeed(null)
          : searchRepositoryIssues(tab, normalizedQuery),
      ),
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
      }),
    ),
  ).then((result) => {
    if (
      requestVersion !== state.issueSearchRequestVersion ||
      activeIssueTab(state).id !== tab.id ||
      shell.issueList.query.trim() !== normalizedQuery
    ) {
      return
    }

    if (result._tag === "Failure") {
      shell.status.content = `Unable to search ${tab.repository}: ${result.message}`
      return
    }

    const searchResult = result.result
    if (!searchResult) return

    shell.issueList.options = searchResult.options
    shell.status.content =
      searchResult.options.length < searchResult.total
        ? `${searchResult.options.length} shown · ${searchResult.total} matches in ${tab.repository}${searchResult.incomplete ? " · partial GitHub result" : ""}`
        : `${searchResult.options.length} matches in ${tab.repository}${searchResult.incomplete ? " · partial GitHub result" : ""}`
  })
}

export const refreshIssues = (shell: AppShell, state: AppState): void => {
  const tab = activeIssueTab(state)
  state.issueSearchRequestVersion++
  const requestVersion = (state.issueRequestVersions.get(tab.id) ?? 0) + 1
  state.issueRequestVersions.set(tab.id, requestVersion)
  shell.status.content = tab.kind === "your-issues" ? "Loading your issues from GitHub CLI…" : `Loading issues from ${tab.repository}…`
  shell.details.setMessage("")

  Effect.runPromise(
    loadIssues(tab).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
      }),
    ),
  ).then((result) => {
    if (requestVersion !== state.issueRequestVersions.get(tab.id)) return

    if (result._tag === "Failure") {
      if (activeIssueTab(state).id !== tab.id) return
      shell.status.content = tab.kind === "your-issues" ? "Unable to load your issues." : `Unable to load ${tab.repository}.`
      shell.details.setMessage(
        tab.kind === "your-issues"
          ? result.message
          : repositoryFailureText(tab.repository, result.message),
      )
      return
    }

    state.issueCache.set(tab.id, result.result)
    if (activeIssueTab(state).id !== tab.id) return
    showIssueTabResult(shell, tab, result.result)
    if (shell.issueList.query.trim()) {
      searchIssues(shell, state, shell.issueList.query)
    }
  })
}

export const selectIssueTab = (shell: AppShell, state: AppState, index: number): void => {
  const tab = state.issueTabs[index]
  if (!tab) return

  state.activeIssueTabIndex = index
  state.addIssueTabRequestVersion++
  state.issueSearchRequestVersion++
  shell.section.content = tab.kind === "your-issues" ? "Issues involving you" : `Issues in ${tab.repository}`

  const cached = state.issueCache.get(tab.id)
  if (cached) {
    showIssueTabResult(shell, tab, cached)
    if (shell.issueList.query.trim()) {
      searchIssues(shell, state, shell.issueList.query)
    }
    return
  }

  shell.issueList.options = []
  refreshIssues(shell, state)
}

export const addRepositoryIssueTab = (shell: AppShell, state: AppState, repository: string): void => {
  const requestVersion = ++state.addIssueTabRequestVersion
  shell.status.content = `Checking ${repository}…`
  shell.focusMain()

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.getRepository(repository)
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, repository: result.full_name }),
      }),
    ),
  ).then((result) => {
    if (requestVersion !== state.addIssueTabRequestVersion) return

    if (result._tag === "Failure") {
      shell.status.content = `Unable to add ${repository}.`
      shell.details.setMessage(repositoryFailureText(repository, result.message))
      return
    }

    const nextTab = repositoryIssuesTab(result.repository)
    let index = state.issueTabs.findIndex((tab) => tab.id === nextTab.id)
    if (index === -1) {
      state.issueTabs.push(nextTab)
      index = state.issueTabs.length - 1
      shell.issueTabs.setOptions(state.issueTabs.map(issueTabOption))
    }

    shell.issueTabs.setSelectedIndex(index)
    shell.focusMain()
  })
}
