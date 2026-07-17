import { createCliRenderer, type KeyEvent } from "@opentui/core"
import {
  createIssueFromDraft,
  openIssueCreatorForRepository,
  openIssueCreatorForSelectedRepository,
} from "../features/issue-creation/actions.js"
import {
  collapseSelectedIssue,
  expandSelectedIssue,
  loadIssueComments,
  refreshIssues,
} from "../features/issues/actions.js"
import { openRepositoryPicker } from "../features/repositories/actions.js"
import { createShell, type AppShell } from "./shell.js"
import { createAppState } from "./state.js"

export const main = async (): Promise<void> => {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const state = createAppState()
  let shell: AppShell

  shell = createShell(renderer, {
    onIssueSelected: (option) => {
      shell.details.setOption(option)
      if (option) loadIssueComments(shell, state, option)
    },
    onIssueSubmit: (draft) => createIssueFromDraft(shell, draft),
    onRepositorySelected: (repository) => openIssueCreatorForRepository(shell, repository),
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

    if (key.name === "escape" && !shell.issueList.visible) {
      key.stopPropagation()
      collapseSelectedIssue(shell)
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
    if (key.name === "r") refreshIssues(shell)
    if (key.ctrl && key.name === "n") {
      key.stopPropagation()
      openIssueCreatorForSelectedRepository(shell)
    }
    if (key.ctrl && key.name === "o") {
      key.stopPropagation()
      openRepositoryPicker(shell, state)
    }
  })

  refreshIssues(shell)
  renderer.start()
}
