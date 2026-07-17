import { BoxRenderable, RGBA, TextRenderable, type CliRenderer } from "@opentui/core"
import { IssueCreatorRenderable } from "../features/issue-creation/IssueCreatorRenderable.js"
import type { IssueDraft } from "../features/issue-creation/model.js"
import { IssueDetailsRenderable } from "../features/issues/IssueDetailsRenderable.js"
import { IssueListRenderable } from "../features/issues/IssueListRenderable.js"
import type { IssueOption } from "../features/issues/issueOption.js"
import { RepositoryPickerRenderable } from "../features/repositories/RepositoryPickerRenderable.js"
import { horizontalLayoutMinWidth, issueDetailsMinWidth, issueListMinWidth, theme } from "../ui/theme.js"

export interface ShellHandlers {
  readonly onIssueSelected: (option: IssueOption | null) => void
  readonly onIssueSubmit: (draft: IssueDraft) => void
  readonly onRepositorySelected: (repository: string) => void
}

export interface AppShell {
  readonly status: TextRenderable
  readonly issueList: IssueListRenderable
  readonly details: IssueDetailsRenderable
  readonly issueCreator: IssueCreatorRenderable
  readonly issueBackdrop: BoxRenderable
  readonly repositoryPicker: RepositoryPickerRenderable
  readonly repositoryBackdrop: BoxRenderable
  readonly createStatus: TextRenderable
  readonly footer: TextRenderable
  readonly updateLayout: (width?: number, height?: number) => void
}

export const createShell = (renderer: CliRenderer, handlers: ShellHandlers): AppShell => {
  renderer.setBackgroundColor(theme.background)

  const bodyHeight = Math.max(8, renderer.terminalHeight - 6)
  const compactLayout = renderer.terminalWidth < horizontalLayoutMinWidth
  const compactListHeight = Math.max(4, Math.floor((bodyHeight - 1) * 0.5))

  const container = new BoxRenderable(renderer, {
    id: "muster-root",
    width: "auto",
    height: "auto",
    backgroundColor: theme.background,
    flexDirection: "column",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 1,
  })
  renderer.root.add(container)

  const headerRow = new BoxRenderable(renderer, {
    id: "header-row",
    width: "auto",
    height: 1,
    flexDirection: "row",
  })
  container.add(headerRow)

  const header = new TextRenderable(renderer, {
    id: "header",
    content: "muster",
    width: 10,
    height: 1,
    fg: theme.text,
  })
  headerRow.add(header)

  const section = new TextRenderable(renderer, {
    id: "section",
    content: "Issues involving you",
    height: 1,
    fg: theme.textSubtle,
  })
  headerRow.add(section)

  const status = new TextRenderable(renderer, {
    id: "status",
    content: "Loading issues from GitHub CLI…",
    height: 1,
    fg: theme.textMuted,
  })
  container.add(status)

  const body = new BoxRenderable(renderer, {
    id: "body",
    width: "auto",
    height: bodyHeight,
    flexDirection: compactLayout ? "column" : "row",
    gap: 1,
    marginTop: 1,
  })
  container.add(body)

  const details = new IssueDetailsRenderable(renderer, {
    id: "details",
    width: compactLayout ? "100%" : "auto",
    minWidth: compactLayout ? 0 : issueDetailsMinWidth,
    flexGrow: 1,
    flexShrink: 1,
    height: compactLayout ? Math.max(1, bodyHeight - compactListHeight - 1) : Math.max(7, bodyHeight - 1),
    marginTop: compactLayout ? 0 : 1,
  })

  const issueList = new IssueListRenderable(renderer, {
    id: "issue-list",
    width: compactLayout ? "100%" : "42%",
    minWidth: compactLayout ? 0 : issueListMinWidth,
    flexShrink: 1,
    height: compactLayout ? compactListHeight : bodyHeight,
    onSelectionChange: handlers.onIssueSelected,
  })
  body.add(issueList)
  body.add(details)

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content:
      "↑/↓ or j/k to move · enter to select · Ctrl+N Create issue in this repo · Ctrl+O Create issue in other repo · r to refresh · q to quit",
    height: 1,
    fg: theme.textSubtle,
  })
  container.add(footer)

  const issueBackdrop = new BoxRenderable(renderer, {
    id: "issue-backdrop",
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    backgroundColor: RGBA.fromInts(0, 0, 0, 150),
    zIndex: 19,
    visible: false,
  })
  renderer.root.add(issueBackdrop)

  const issueCreator = new IssueCreatorRenderable(renderer, {
    id: "issue-creator",
    position: "absolute",
    left: Math.max(2, Math.floor((renderer.terminalWidth - Math.min(82, renderer.terminalWidth - 4)) / 2)),
    top: Math.max(2, Math.floor((renderer.terminalHeight - Math.min(20, renderer.terminalHeight - 4)) / 2)),
    width: Math.min(82, renderer.terminalWidth - 4),
    height: Math.min(20, renderer.terminalHeight - 4),
    zIndex: 20,
    onSubmit: handlers.onIssueSubmit,
    onCancel: () => {
      issueBackdrop.visible = false
      status.content = "Issue creation cancelled."
      issueList.focus()
    },
  })
  renderer.root.add(issueCreator)

  const repositoryBackdrop = new BoxRenderable(renderer, {
    id: "repository-backdrop",
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    backgroundColor: RGBA.fromInts(0, 0, 0, 150),
    zIndex: 24,
    visible: false,
  })
  renderer.root.add(repositoryBackdrop)

  const repositoryPicker = new RepositoryPickerRenderable(renderer, {
    id: "repository-picker",
    position: "absolute",
    left: Math.max(2, Math.floor((renderer.terminalWidth - Math.min(70, renderer.terminalWidth - 4)) / 2)),
    top: Math.max(2, Math.floor((renderer.terminalHeight - Math.min(18, renderer.terminalHeight - 4)) / 2)),
    width: Math.min(70, renderer.terminalWidth - 4),
    height: Math.min(18, renderer.terminalHeight - 4),
    zIndex: 25,
    onSelect: (repository) => {
      repositoryBackdrop.visible = false
      repositoryPicker.close()
      handlers.onRepositorySelected(repository)
    },
    onCancel: () => {
      repositoryBackdrop.visible = false
      status.content = "Repository selection cancelled."
      issueList.focus()
    },
  })
  renderer.root.add(repositoryPicker)

  const createStatus = new TextRenderable(renderer, {
    id: "create-status",
    position: "absolute",
    top: 1,
    right: 1,
    width: 1,
    height: 1,
    zIndex: 30,
    content: "",
    fg: "#ffffff",
    bg: theme.blue,
    visible: false,
  })
  renderer.root.add(createStatus)

  issueList.focus()

  const updateLayout = (width = renderer.terminalWidth, height = renderer.terminalHeight): void => {
    const nextBodyHeight = Math.max(8, height - 6)
    const expanded = !issueList.visible
    const compact = !expanded && width < horizontalLayoutMinWidth
    const listHeight = Math.max(4, Math.floor((nextBodyHeight - 1) * 0.5))

    body.height = nextBodyHeight
    body.flexDirection = compact ? "column" : "row"

    issueList.width = compact ? "100%" : "42%"
    issueList.minWidth = compact ? 0 : issueListMinWidth
    issueList.height = compact ? listHeight : nextBodyHeight

    details.width = expanded || compact ? "100%" : "auto"
    details.minWidth = compact ? 0 : issueDetailsMinWidth
    details.height = expanded
      ? Math.max(7, nextBodyHeight - 1)
      : compact
        ? Math.max(1, nextBodyHeight - listHeight - 1)
        : Math.max(7, nextBodyHeight - 1)
    details.marginTop = compact ? 0 : 1

    const creatorWidth = Math.max(1, Math.min(82, width - 4))
    const creatorHeight = Math.max(1, Math.min(20, height - 4))
    issueCreator.width = creatorWidth
    issueCreator.height = creatorHeight
    issueCreator.left = Math.max(0, Math.floor((width - creatorWidth) / 2))
    issueCreator.top = Math.max(0, Math.floor((height - creatorHeight) / 2))

    const pickerWidth = Math.max(1, Math.min(70, width - 4))
    const pickerHeight = Math.max(1, Math.min(18, height - 4))
    repositoryPicker.width = pickerWidth
    repositoryPicker.height = pickerHeight
    repositoryPicker.left = Math.max(0, Math.floor((width - pickerWidth) / 2))
    repositoryPicker.top = Math.max(0, Math.floor((height - pickerHeight) / 2))
  }

  return {
    status,
    issueList,
    details,
    issueCreator,
    issueBackdrop,
    repositoryPicker,
    repositoryBackdrop,
    createStatus,
    footer,
    updateLayout,
  }
}
