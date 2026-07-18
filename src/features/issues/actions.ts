import { Effect } from "effect"
import { appLayer, errorText, forkEffect } from "../../app/githubRuntime.js"
import type { AppShell } from "../../app/shell.js"
import type { AppState } from "../../app/state.js"
import { GitHubIssues } from "../../services/GitHubIssues.js"
import type { CommentDraft } from "./commentDraft.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"
import {
  issueTabOption,
  nextIssueStateFilter,
  repositoryIssuesTab,
  type IssueTab,
  type IssueTabResult,
} from "./issueTab.js"
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
    "j/k or arrows scroll · PgUp/PgDn · o switch issue type · c comment · x close/reopen · Tab switch · Esc collapse · n new issue · r refresh · q quit"
  shell.status.content = "Issue expanded."
}

export const collapseSelectedIssue = (shell: AppShell): void => {
  shell.issueList.visible = true
  shell.details.width = "auto"
  shell.details.setExpanded(false)
  shell.updateLayout()
  shell.footer.content =
    "Tab switch · / search · o switch issue type · c comment · x close/reopen · a add repo · ↑/↓ or j/k move · enter expand · n new issue · r refresh · q quit"
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
  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.listComments(value.repository, value.issue.number)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        if (requestVersion !== state.commentRequestVersions.get(key)) return
        state.commentRequests.delete(key)
        shell.details.setCommentsError(key, errorText(error))
      },
      onSuccess: (comments) => {
        if (requestVersion !== state.commentRequestVersions.get(key)) return
        state.commentRequests.delete(key)
        state.commentCache.set(key, comments)
        shell.details.setComments(key, comments)
      },
    },
  )
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

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.createComment(value.repository, value.issue.number, draft.body)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        shell.status.content = "Unable to add comment."
        if (shell.commentComposer.isOpenFor(draft.option)) shell.commentComposer.setMessage(errorText(error))
      },
      onSuccess: (comment) => {
        state.commentRequestVersions.set(key, (state.commentRequestVersions.get(key) ?? 0) + 1)
        state.commentRequests.delete(key)
        const cached = state.commentCache.get(key)
        if (cached) {
          const comments = [...cached.filter((cachedComment) => cachedComment.id !== comment.id), comment]
          state.commentCache.set(key, comments)
          shell.details.setComments(key, comments)
        } else {
          requestIssueComments(shell, state, draft.option, true)
        }

        shell.commentComposer.close()
        shell.issueBackdrop.visible = false
        shell.status.content = `Comment added to ${value.repository} #${value.issue.number}.`
        shell.focusMain()
      },
    },
  )
}

const setIssueState = (shell: AppShell, state: AppState, option: IssueOption, nextState: "open" | "closed"): void => {
  const key = issueOptionKey(option)
  if (state.issueStateRequests.has(key)) {
    shell.status.content = `Issue ${option.value.repository} #${option.value.issue.number} is already being updated.`
    return
  }

  const value = option.value
  const action = nextState === "closed" ? "Closing" : "Reopening"
  state.issueStateRequests.add(key)
  shell.status.content = `${action} ${value.repository} #${value.issue.number}...`

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.setState(value.repository, value.issue.number, nextState)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        state.issueStateRequests.delete(key)
        shell.status.content = `Unable to ${nextState === "closed" ? "close" : "reopen"} ${value.repository} #${value.issue.number}.`
        if (nextState === "closed" && shell.issueCloseConfirmation.isOpenFor(option)) {
          shell.issueCloseConfirmation.setMessage(errorText(error))
        }
      },
      onSuccess: (issue) => {
        state.issueStateRequests.delete(key)
        shell.issueCloseConfirmation.close()
        shell.issueBackdrop.visible = false
        state.issueCache.clear()
        state.issueSearchRequestVersion++
        for (const tab of state.issueTabs) {
          state.issueRequestVersions.set(tab.id, (state.issueRequestVersions.get(tab.id) ?? 0) + 1)
        }

        const updatedOption: IssueOption = {
          ...option,
          value: { ...value, issue },
        }
        const include = state.issueStateFilter === "all" || state.issueStateFilter === nextState
        shell.issueList.updateIssueOption(updatedOption, include)
        shell.status.content = `${nextState === "closed" ? "Closed" : "Reopened"} ${value.repository} #${value.issue.number}.`
        shell.focusMain()
      },
    },
  )
}

export const toggleSelectedIssueState = (shell: AppShell, state: AppState): void => {
  const option = shell.issueList.getSelectedOption()
  if (!option) {
    shell.status.content = "Select an issue before closing or reopening it."
    return
  }

  if (option.value.issue.state === "closed") {
    setIssueState(shell, state, option, "open")
    return
  }

  shell.issueBackdrop.visible = true
  shell.issueCloseConfirmation.open(option)
  shell.status.content = `Confirm closing ${option.value.repository} #${option.value.issue.number}.`
}

export const confirmCloseIssue = (shell: AppShell, state: AppState, option: IssueOption): void => {
  setIssueState(shell, state, option, "closed")
}

const activeIssueTab = (state: AppState): IssueTab => state.issueTabs[state.activeIssueTabIndex] ?? state.issueTabs[0]

const repositoryFailureText = (repository: string, message: string): string =>
  /(?:Not Found|HTTP 404)/.test(message)
    ? `Check that ${repository} exists and that you have access to it.`
    : message

const showIssueTabResult = (shell: AppShell, tab: IssueTab, result: IssueTabResult): void => {
  shell.issueList.loading = false
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
  const issueStateFilter = state.issueStateFilter
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
  shell.issueList.loading = true
  shell.status.content = `Searching all issues in ${tab.repository}…`
  const isStale = (): boolean =>
    requestVersion !== state.issueSearchRequestVersion ||
    activeIssueTab(state).id !== tab.id ||
    state.issueStateFilter !== issueStateFilter ||
    shell.issueList.query.trim() !== normalizedQuery

  forkEffect(
    Effect.sleep("300 millis").pipe(
      Effect.flatMap(() =>
        requestVersion !== state.issueSearchRequestVersion ||
        activeIssueTab(state).id !== tab.id ||
        shell.issueList.query.trim() !== normalizedQuery
          ? Effect.succeed(null)
          : searchRepositoryIssues(tab, normalizedQuery, issueStateFilter),
      ),
      Effect.provide(appLayer),
    ),
    {
      onFailure: (error) => {
        if (isStale()) return
        shell.issueList.loading = false
        shell.status.content = `Unable to search ${tab.repository}: ${errorText(error)}`
      },
      onSuccess: (searchResult) => {
        if (isStale() || !searchResult) return
        shell.issueList.loading = false
        shell.issueList.options = searchResult.options
        shell.status.content =
          searchResult.options.length < searchResult.total
            ? `${searchResult.options.length} shown · ${searchResult.total} matches in ${tab.repository}${searchResult.incomplete ? " · partial GitHub result" : ""}`
            : `${searchResult.options.length} matches in ${tab.repository}${searchResult.incomplete ? " · partial GitHub result" : ""}`
      },
    },
  )
}

export const refreshIssues = (shell: AppShell, state: AppState): void => {
  const tab = activeIssueTab(state)
  const issueStateFilter = state.issueStateFilter
  state.issueSearchRequestVersion++
  const requestVersion = (state.issueRequestVersions.get(tab.id) ?? 0) + 1
  state.issueRequestVersions.set(tab.id, requestVersion)
  const stateLabel = issueStateFilter === "all" ? "all" : issueStateFilter
  shell.issueList.loading = true
  shell.status.content =
    tab.kind === "your-issues"
      ? `Loading ${stateLabel} issues involving you…`
      : `Loading ${stateLabel} issues from ${tab.repository}…`
  shell.details.setMessage("")

  const isStale = (): boolean =>
    requestVersion !== state.issueRequestVersions.get(tab.id) || state.issueStateFilter !== issueStateFilter

  forkEffect(loadIssues(tab, issueStateFilter).pipe(Effect.provide(appLayer)), {
    onFailure: (error) => {
      if (isStale() || activeIssueTab(state).id !== tab.id) return
      const message = errorText(error)
      shell.issueList.loading = false
      shell.status.content = tab.kind === "your-issues" ? "Unable to load your issues." : `Unable to load ${tab.repository}.`
      shell.details.setMessage(
        tab.kind === "your-issues"
          ? message
          : repositoryFailureText(tab.repository, message),
      )
    },
    onSuccess: (result) => {
      if (isStale()) return
      state.issueCache.set(tab.id, result)
      if (activeIssueTab(state).id !== tab.id) return
      showIssueTabResult(shell, tab, result)
      if (shell.issueList.query.trim()) searchIssues(shell, state, shell.issueList.query)
    },
  })
}

export const cycleIssueStateFilter = (shell: AppShell, state: AppState): void => {
  state.issueStateFilter = nextIssueStateFilter(state.issueStateFilter)
  shell.issueList.issueStateFilter = state.issueStateFilter
  state.issueCache.clear()
  state.issueSearchRequestVersion++
  for (const tab of state.issueTabs) {
    state.issueRequestVersions.set(tab.id, (state.issueRequestVersions.get(tab.id) ?? 0) + 1)
  }
  refreshIssues(shell, state)
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

  forkEffect(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.getRepository(repository)
    }).pipe(Effect.provide(appLayer)),
    {
      onFailure: (error) => {
        if (requestVersion !== state.addIssueTabRequestVersion) return
        shell.status.content = `Unable to add ${repository}.`
        shell.details.setMessage(repositoryFailureText(repository, errorText(error)))
      },
      onSuccess: (result) => {
        if (requestVersion !== state.addIssueTabRequestVersion) return
        const nextTab = repositoryIssuesTab(result.full_name)
        let index = state.issueTabs.findIndex((tab) => tab.id === nextTab.id)
        if (index === -1) {
          state.issueTabs.push(nextTab)
          index = state.issueTabs.length - 1
          shell.issueTabs.setOptions(state.issueTabs.map(issueTabOption))
        }

        shell.issueTabs.setSelectedIndex(index)
        shell.focusMain()
      },
    },
  )
}
