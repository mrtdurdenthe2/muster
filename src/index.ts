import {
  BoxRenderable,
  createCliRenderer,
  OptimizedBuffer,
  parseColor,
  Renderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
  type SelectOption,
} from "@opentui/core"
import { Effect, Layer, Match, ParseResult } from "effect"
import { CommandError, JsonParseError } from "./services/CommandRunner.js"
import { GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "./services/GitHubCli.js"
import { GitHubIssues, GitHubIssuesLive, type GitHubIssue } from "./services/GitHubIssues.js"

interface IssueOptionValue {
  readonly issue: GitHubIssue
  readonly repository: string
}

interface IssueListRow {
  readonly kind: "header" | "issue"
  readonly repository?: string
  readonly option?: SelectOption
  readonly optionIndex?: number
}

const appLayer = Layer.merge(GitHubCliLive, GitHubIssuesLive)

const renderAuthHelp = (error: GitHubCliUnavailable | GitHubCliUnauthenticated): string =>
  Match.value(error).pipe(
    Match.tag("GitHubCliUnavailable", () => "GitHub CLI is required. Install it from https://cli.github.com/ and run `gh auth login`."),
    Match.tag("GitHubCliUnauthenticated", () => "GitHub CLI is not authenticated. Run `gh auth login --hostname github.com --web --scopes repo,read:org`."),
    Match.exhaustive,
  )

const errorText = (error: GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError): string =>
  Match.value(error).pipe(
    Match.tag("GitHubCliUnavailable", renderAuthHelp),
    Match.tag("GitHubCliUnauthenticated", renderAuthHelp),
    Match.tag("CommandError", (commandError) => commandError.detail),
    Match.tag("JsonParseError", () => "GitHub CLI returned invalid JSON."),
    Match.tag("ParseError", (parseError) => parseError.message),
    Match.exhaustive,
  )

const truncate = (value: string, length: number): string => {
  if (value.length <= length) return value
  if (length <= 1) return value.slice(0, length)
  return `${value.slice(0, length - 1)}…`
}

const formatDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const issueToOption = (issue: GitHubIssue, issues: GitHubIssues): SelectOption => {
  const repository = issues.repositoryNameFromApiUrl(issue.repository_url)
  const labels = issue.labels.map((label) => label.name).join(", ")
  const descriptionParts = [`${repository} #${issue.number}`, `updated ${formatDate(issue.updated_at)}`]
  if (labels) descriptionParts.push(labels)

  return {
    name: truncate(issue.title, 90),
    description: descriptionParts.join(" · "),
    value: { issue, repository } satisfies IssueOptionValue,
  }
}

const selectedIssueText = (option: SelectOption | null): string => {
  if (!option) return "No issue selected."
  const value = option.value as IssueOptionValue
  const labels = value.issue.labels.map((label) => label.name).join(", ") || "none"

  return [
    `${value.repository} #${value.issue.number}`,
    value.issue.title,
    "",
    `Author: ${value.issue.user.login}`,
    `State: ${value.issue.state}`,
    `Updated: ${formatDate(value.issue.updated_at)}`,
    `Labels: ${labels}`,
    "",
    value.issue.html_url,
  ].join("\n")
}

const issuesGroupedByRepository = (options: ReadonlyArray<SelectOption>): ReadonlyArray<IssueListRow> => {
  const rows: IssueListRow[] = []
  let currentRepository: string | null = null

  options.forEach((option, optionIndex) => {
    const value = option.value as IssueOptionValue
    if (value.repository !== currentRepository) {
      currentRepository = value.repository
      rows.push({ kind: "header", repository: currentRepository })
    }
    rows.push({ kind: "issue", option, optionIndex })
  })

  return rows
}

class IssueListRenderable extends Renderable {
  protected _focusable = true

  private _options: SelectOption[] = []
  private rows: ReadonlyArray<IssueListRow> = []
  private selectedIndex = 0
  private scrollOffset = 0
  private readonly backgroundColor = parseColor("#161b22")
  private readonly headerBackgroundColor = parseColor("#0d1117")
  private readonly headerTextColor = parseColor("#8b949e")
  private readonly textColor = parseColor("#c9d1d9")
  private readonly selectedBackgroundColor = parseColor("#1f6feb")
  private readonly selectedTextColor = parseColor("#ffffff")
  private readonly descriptionColor = parseColor("#8b949e")
  private readonly selectedDescriptionColor = parseColor("#dbeafe")
  private readonly onSelectionChange: (option: SelectOption | null) => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<IssueListRenderable> & { onSelectionChange: (option: SelectOption | null) => void },
  ) {
    super(ctx, { ...options, buffered: true })
    this.onSelectionChange = options.onSelectionChange
  }

  public get options(): ReadonlyArray<SelectOption> {
    return this._options
  }

  public set options(options: ReadonlyArray<SelectOption>) {
    this._options = [...options]
    this.rows = issuesGroupedByRepository(this._options)
    this.selectedIndex = this._options.length > 0 ? Math.min(this.selectedIndex, this._options.length - 1) : 0
    this.updateScrollOffset()
    this.onSelectionChange(this.getSelectedOption())
    this.requestRender()
  }

  public getSelectedOption(): SelectOption | null {
    return this._options[this.selectedIndex] ?? null
  }

  public handleKeyPress(key: KeyEvent): boolean {
    if (key.name === "up" || key.name === "k") return this.moveSelection(-1)
    if (key.name === "down" || key.name === "j") return this.moveSelection(1)
    if (key.name === "return" || key.name === "linefeed") {
      this.onSelectionChange(this.getSelectedOption())
      return true
    }

    return false
  }

  protected renderSelf(buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.backgroundColor)
      let y = -this.scrollOffset

      for (const row of this.rows) {
        const rowHeight = row.kind === "header" ? 1 : 2
        if (y + rowHeight <= 0) {
          y += rowHeight
          continue
        }
        if (y >= this.height) break

        if (row.kind === "header") {
          if (y >= 0) {
            this.frameBuffer.fillRect(0, y, this.width, 1, this.headerBackgroundColor)
            this.frameBuffer.drawText(` ${row.repository?.toUpperCase() ?? ""}`, 0, y, this.headerTextColor)
          }
        } else if (row.option && row.optionIndex !== undefined) {
          const selected = row.optionIndex === this.selectedIndex
          const bgColor = selected ? this.selectedBackgroundColor : this.backgroundColor
          const titleColor = selected ? this.selectedTextColor : this.textColor
          const descriptionColor = selected ? this.selectedDescriptionColor : this.descriptionColor
          if (y >= 0) {
            this.frameBuffer.fillRect(0, y, this.width, Math.min(2, this.height - y), bgColor)
            this.frameBuffer.drawText(`${selected ? "▶" : " "} ${row.option.name}`, 1, y, titleColor)
          }
          if (y + 1 >= 0 && y + 1 < this.height) {
            this.frameBuffer.drawText(`  ${row.option.description}`, 1, y + 1, descriptionColor)
          }
        }

        y += rowHeight
      }
    }
  }

  private moveSelection(delta: number): boolean {
    if (this._options.length === 0) return false

    const nextIndex = Math.max(0, Math.min(this.selectedIndex + delta, this._options.length - 1))
    if (nextIndex === this.selectedIndex) return true

    this.selectedIndex = nextIndex
    this.updateScrollOffset()
    this.onSelectionChange(this.getSelectedOption())
    this.requestRender()
    return true
  }

  private updateScrollOffset(): void {
    let selectedTop = 0
    for (const row of this.rows) {
      if (row.kind === "issue" && row.optionIndex === this.selectedIndex) break
      selectedTop += row.kind === "header" ? 1 : 2
    }
    const selectedBottom = selectedTop + 2

    if (selectedTop < this.scrollOffset) {
      this.scrollOffset = selectedTop
    } else if (selectedBottom > this.scrollOffset + this.height) {
      this.scrollOffset = selectedBottom - this.height
    }
  }
}

const loadIssues = Effect.gen(function* () {
  const issues = yield* GitHubIssues
  const response = yield* issues.searchAssigned({ limit: 50 })
  const options = response.items.map((issue) => issueToOption(issue, issues)).sort((left, right) => {
    const leftValue = left.value as IssueOptionValue
    const rightValue = right.value as IssueOptionValue
    return (
      leftValue.repository.localeCompare(rightValue.repository) ||
      rightValue.issue.updated_at.localeCompare(leftValue.issue.updated_at)
    )
  })

  return {
    total: response.total_count,
    options,
  }
})

const createShell = (renderer: CliRenderer) => {
  renderer.setBackgroundColor("#0d1117")

  const container = new BoxRenderable(renderer, {
    id: "muster-root",
    width: "auto",
    height: "auto",
    backgroundColor: "#0d1117",
    flexDirection: "column",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 1,
  })
  renderer.root.add(container)

  const header = new TextRenderable(renderer, {
    id: "header",
    content: "muster · GitHub issues involving you",
    height: 1,
    fg: "#58a6ff",
  })
  container.add(header)

  const status = new TextRenderable(renderer, {
    id: "status",
    content: "Loading issues from GitHub CLI…",
    height: 1,
    fg: "#8b949e",
  })
  container.add(status)

  const body = new BoxRenderable(renderer, {
    id: "body",
    width: "auto",
    height: Math.max(8, renderer.terminalHeight - 6),
    flexDirection: "row",
  })
  container.add(body)

  const issueList = new IssueListRenderable(renderer, {
    id: "issue-list",
    width: Math.max(48, Math.floor(renderer.terminalWidth * 0.58)),
    height: Math.max(8, renderer.terminalHeight - 6),
    onSelectionChange: (option) => {
      details.content = selectedIssueText(option)
    },
  })
  body.add(issueList)

  const details = new TextRenderable(renderer, {
    id: "details",
    content: "Select an issue to see details.",
    width: "auto",
    height: Math.max(8, renderer.terminalHeight - 6),
    fg: "#c9d1d9",
  })
  body.add(details)

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: "↑/↓ or j/k to move · enter to select · N new issue · r to refresh · q to quit",
    height: 1,
    fg: "#8b949e",
  })
  container.add(footer)

  issueList.focus()

  return { status, issueList, details }
}

const refreshIssues = (shell: ReturnType<typeof createShell>): void => {
  shell.status.content = "Loading issues from GitHub CLI…"
  shell.details.content = ""

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
      shell.details.content = result.message
      return
    }

    shell.issueList.options = result.result.options
    shell.status.content = `${result.result.options.length} shown · ${result.result.total} total matches`
    shell.details.content = selectedIssueText(shell.issueList.getSelectedOption())
  })
}

const createIssueForSelectedRepository = (shell: ReturnType<typeof createShell>): void => {
  const selectedOption = shell.issueList.getSelectedOption()
  if (!selectedOption) {
    shell.status.content = "Select a repository issue before creating a new issue."
    return
  }

  const { repository } = selectedOption.value as IssueOptionValue
  shell.status.content = `Opening GitHub issue creator for ${repository}…`

  Effect.runPromise(
    Effect.gen(function* () {
      const issues = yield* GitHubIssues
      return yield* issues.createInBrowser({ repository })
    }).pipe(
      Effect.provide(appLayer),
      Effect.match({
        onFailure: (error) => ({ _tag: "Failure" as const, message: errorText(error) }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
      }),
    ),
  ).then((result) => {
    if (result._tag === "Failure") {
      shell.status.content = "Unable to open issue creator."
      shell.details.content = result.message
      return
    }

    shell.status.content = result.result.opened
      ? `Opened GitHub issue creator for ${repository}. Press r to refresh after creating it.`
      : `Issue creator URL ready for ${repository}. Press r to refresh after creating it.`
    shell.details.content = result.result.url
  })
}

const main = async (): Promise<void> => {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const shell = createShell(renderer)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q" || key.sequence === "q" || key.raw === "q") {
      key.stopPropagation()
      renderer.destroy()
      return
    }
    if (key.name === "r") refreshIssues(shell)
    if (key.name === "N" || key.sequence === "N" || key.raw === "N") {
      key.stopPropagation()
      createIssueForSelectedRepository(shell)
    }
  })

  refreshIssues(shell)
  renderer.start()
}

await main()
