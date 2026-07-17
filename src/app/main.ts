import { createCliRenderer, type KeyEvent } from "@opentui/core"
import {
  createIssueFromDraft,
  openIssueCreatorForRepository,
  openIssueCreatorForSelectedRepository,
} from "../features/issue-creation/actions.js"
import {
  addRepositoryIssueTab,
  collapseSelectedIssue,
  createCommentFromDraft,
  expandSelectedIssue,
  loadIssueComments,
  openCommentComposer,
  refreshIssues,
  selectIssueTab,
} from "../features/issues/actions.js"
import { openRepositoryPicker } from "../features/repositories/actions.js"
import { registerIssueSyntaxParsers } from "../ui/syntax.js"
import { createShell, type AppShell } from "./shell.js"
import { createAppState } from "./state.js"

export const main = async (): Promise<void> => {
  registerIssueSyntaxParsers()
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const state = createAppState()
  let repositorySelection: "create-issue" | "add-tab" = "create-issue"
  let shell: AppShell

  shell = createShell(renderer, {
    onIssueSelected: (option) => {
      shell.details.setOption(option)
      if (option) loadIssueComments(shell, state, option)
    },
    onIssueSubmit: (draft) => createIssueFromDraft(shell, state, draft),
    onCommentSubmit: (draft) => createCommentFromDraft(shell, state, draft),
    onRepositorySelected: (repository) => {
      if (repositorySelection === "add-tab") {
        addRepositoryIssueTab(shell, state, repository)
        return
      }
      openIssueCreatorForRepository(shell, repository)
    },
    onIssueTabSelected: (index) => selectIssueTab(shell, state, index),
  })

  renderer.on("resize", shell.updateLayout)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (shell.repositoryPicker.visible) {
      key.stopPropagation()
      shell.repositoryPicker.handleKeyPress(key)
      return
    }

    if (shell.issueCreator.visible) {
      key.stopPropagation()
      shell.issueCreator.handleKeyPress(key)
      return
    }

    if (shell.commentComposer.visible) {
      key.stopPropagation()
      shell.commentComposer.handleKeyPress(key)
      return
    }

    if (shell.issueList.visible && shell.issueList.searching) {
      key.stopPropagation()
      shell.issueList.handleKeyPress(key)
      return
    }

    if (key.name === "escape" && !shell.issueList.visible) {
      key.stopPropagation()
      collapseSelectedIssue(shell)
      return
    }

    if (key.name === "tab") {
      key.stopPropagation()
      if (state.issueTabs.length > 1) {
        if (key.shift) {
          shell.issueTabs.moveLeft()
        } else {
          shell.issueTabs.moveRight()
        }
      }
      return
    }

    if (key.name === "q" || key.sequence === "q" || key.raw === "q") {
      key.stopPropagation()
      renderer.destroy()
      return
    }
    if (key.name === "return" || key.name === "linefeed") {
      key.stopPropagation()
      expandSelectedIssue(shell)
      return
    }
    if (key.name === "r") refreshIssues(shell, state)
    if (!key.ctrl && !key.meta && !key.option && key.name === "c") {
      key.stopPropagation()
      openCommentComposer(shell)
    }
    if (!key.ctrl && !key.meta && !key.option && key.name === "n") {
      key.stopPropagation()
      state.addIssueTabRequestVersion++
      const tab = state.issueTabs[state.activeIssueTabIndex]
      openIssueCreatorForSelectedRepository(shell, tab?.kind === "repository" ? tab.repository : undefined)
    }
    if (!key.ctrl && !key.meta && !key.option && key.name === "o") {
      key.stopPropagation()
      repositorySelection = "create-issue"
      openRepositoryPicker(shell, state, {
        title: "Make Issue in Other Repo",
        prompt: "Choose a repository for the new issue.",
      })
    }
    if (!key.ctrl && !key.meta && !key.option && key.name === "a") {
      key.stopPropagation()
      repositorySelection = "add-tab"
      openRepositoryPicker(shell, state, {
        title: "Add Repository Tab",
        prompt: "Choose a repository to add as a tab.",
      })
    }
  })

  refreshIssues(shell, state)
  renderer.start()
}
