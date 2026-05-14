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
import { GitHubIssues, GitHubIssuesLive, type GitHubIssue, type GitHubLabel } from "./services/GitHubIssues.js"

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

interface IssueDraft {
  readonly repository: string
  readonly title: string
  readonly body: string
  readonly labels: ReadonlyArray<string>
}

type IssueCreatorField = "title" | "body"

const appLayer = Layer.merge(GitHubCliLive, GitHubIssuesLive)

const labelKey = (label: string): string => label.trim().toLocaleLowerCase()

const uniqueLabels = (labels: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const label of labels) {
    const trimmed = label.trim()
    const key = labelKey(trimmed)
    if (!key || seen.has(key)) continue

    seen.add(key)
    unique.push(trimmed)
  }
  return unique
}

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

const labelBackgroundColor = (color: string): string => (/^[0-9a-f]{6}$/i.test(color) ? `#${color}` : "#30363d")

const labelTextColor = (color: string): string => {
  if (!/^[0-9a-f]{6}$/i.test(color)) return "#c9d1d9"

  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? "#0d1117" : "#ffffff"
}

const wrapText = (value: string, width: number): ReadonlyArray<string> => {
  if (width <= 0) return []

  return value.split("\n").flatMap((line) => {
    if (!line) return [""]

    const wrapped: string[] = []
    let remaining = line
    while (remaining.length > width) {
      const breakpoint = remaining.lastIndexOf(" ", width)
      const end = breakpoint > 0 ? breakpoint : width
      wrapped.push(remaining.slice(0, end))
      remaining = remaining.slice(end).trimStart()
    }
    wrapped.push(remaining)
    return wrapped
  })
}

const limitedWrappedText = (value: string, width: number, maxLines: number): ReadonlyArray<string> => {
  const lines = wrapText(value, width)
  if (lines.length <= maxLines) return lines
  if (maxLines <= 0) return []

  const visible = lines.slice(0, maxLines)
  const lastLine = visible[visible.length - 1]
  visible[visible.length - 1] = width <= 1 ? "…" : `${lastLine.slice(0, width - 1)}…`
  return visible
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

class IssueDetailsRenderable extends Renderable {
  private option: SelectOption | null = null
  private message = "Select an issue to see details."
  private expanded = false
  private readonly backgroundColor = parseColor("#0d1117")
  private readonly barColor = parseColor("#111820")
  private readonly panelColor = parseColor("#0f141b")
  private readonly borderColor = parseColor("#30363d")
  private readonly titleColor = parseColor("#f0f6fc")
  private readonly textColor = parseColor("#c9d1d9")
  private readonly mutedColor = parseColor("#8b949e")
  private readonly linkColor = parseColor("#58a6ff")

  constructor(ctx: CliRenderer, options: RenderableOptions<IssueDetailsRenderable>) {
    super(ctx, { ...options, buffered: true })
  }

  public setOption(option: SelectOption | null): void {
    this.option = option
    this.message = option ? "" : "No issue selected."
    this.requestRender()
  }

  public setMessage(message: string): void {
    this.option = null
    this.message = message
    this.requestRender()
  }

  public setExpanded(expanded: boolean): void {
    this.expanded = expanded
    this.requestRender()
  }

  protected renderSelf(buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.backgroundColor)

      if (!this.option) {
        this.frameBuffer.fillRect(0, 0, this.width, this.height, this.panelColor)
        this.frameBuffer.drawText(truncate(this.message, Math.max(0, this.width - 2)), 1, 1, this.mutedColor)
        return
      }

      const value = this.option.value as IssueOptionValue
      const barHeight = Math.min(3, this.height)
      this.frameBuffer.fillRect(0, 0, this.width, barHeight, this.barColor)
      this.frameBuffer.fillRect(0, barHeight, this.width, Math.max(0, this.height - barHeight), this.panelColor)
      this.frameBuffer.fillRect(0, barHeight, this.width, 1, this.borderColor)

      const title = `${value.repository} #${value.issue.number} · ${value.issue.title}`
      let x = 1
      this.frameBuffer.drawText(truncate(title, Math.max(0, this.width - 2)), x, 0, this.titleColor)

      const labels = value.issue.labels
      x = 1
      for (const label of labels) {
        const labelText = ` ${label.name} `
        if (x + labelText.length >= this.width - 1) break
        this.frameBuffer.fillRect(x, 1, labelText.length, 1, parseColor(labelBackgroundColor(label.color)))
        this.frameBuffer.drawText(labelText, x, 1, parseColor(labelTextColor(label.color)))
        x += labelText.length + 1
      }
      if (labels.length === 0) this.frameBuffer.drawText(" no labels ", 1, 1, this.mutedColor)

      const hint = this.expanded ? "Esc collapse" : "Enter expand"
      this.frameBuffer.drawText(truncate(hint, Math.max(0, this.width - 2)), 1, 2, this.mutedColor)

      const contentWidth = Math.max(0, this.width - 4)
      const contentHeight = Math.max(0, this.height - 5)
      const body = value.issue.body?.trim() || "No description provided."
      const detailLines = [
        `Author: ${value.issue.user.login}`,
        `State: ${value.issue.state}`,
        `Updated: ${formatDate(value.issue.updated_at)}`,
        value.issue.html_url,
        "",
        ...limitedWrappedText(body, contentWidth, Math.max(0, contentHeight - 5)),
      ]

      detailLines.slice(0, contentHeight).forEach((line, index) => {
        const y = index + 4
        const color = line === value.issue.html_url ? this.linkColor : line === "" ? this.mutedColor : this.textColor
        this.frameBuffer?.drawText(truncate(line, contentWidth), 2, y, color)
      })
    }
  }
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

class IssueCreatorRenderable extends Renderable {
  protected _focusable = true

  private repository = ""
  private title = ""
  private body = ""
  private availableLabels: ReadonlyArray<GitHubLabel> = []
  private selectedLabels: ReadonlyArray<string> = []
  private activeField: IssueCreatorField = "title"
  private labelPickerOpen = false
  private labelSearch = ""
  private labelSelectedIndex = 0
  private message = ""
  private submitting = false
  private readonly backgroundColor = parseColor("#0d1117")
  private readonly borderColor = parseColor("#30363d")
  private readonly titleColor = parseColor("#58a6ff")
  private readonly labelColor = parseColor("#8b949e")
  private readonly textColor = parseColor("#c9d1d9")
  private readonly mutedColor = parseColor("#6e7681")
  private readonly activeColor = parseColor("#1f6feb")
  private readonly errorColor = parseColor("#f85149")
  private readonly onSubmit: (draft: IssueDraft) => void
  private readonly onCancel: () => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<IssueCreatorRenderable> & {
      onSubmit: (draft: IssueDraft) => void
      onCancel: () => void
    },
  ) {
    super(ctx, { ...options, buffered: true, visible: false })
    this.onSubmit = options.onSubmit
    this.onCancel = options.onCancel
  }

  public open(repository: string): void {
    this.repository = repository
    this.title = ""
    this.body = ""
    this.availableLabels = []
    this.selectedLabels = []
    this.activeField = "title"
    this.labelPickerOpen = false
    this.labelSearch = ""
    this.labelSelectedIndex = 0
    this.message = ""
    this.submitting = false
    this.visible = true
    this.focus()
    this.requestRender()
  }

  public close(): void {
    this.visible = false
    this.requestRender()
  }

  public setSubmitting(submitting: boolean): void {
    this.submitting = submitting
    this.message = submitting ? "Creating issue..." : ""
    this.requestRender()
  }

  public setAvailableLabels(labels: ReadonlyArray<GitHubLabel>): void {
    this.availableLabels = [...labels].sort((left, right) => left.name.localeCompare(right.name))
    this.labelSelectedIndex = 0
    this.message = this.message === "Loading labels..." ? "" : this.message
    this.requestRender()
  }

  public setMessage(message: string): void {
    this.submitting = false
    this.message = message
    this.requestRender()
  }

  public handleKeyPress(key: KeyEvent): boolean {
    if (!this.visible) return false
    if (this.submitting) return true

    if (this.labelPickerOpen) return this.handleLabelPickerKeyPress(key)

    if (key.name === "escape") {
      this.close()
      this.onCancel()
      return true
    }

    if (key.ctrl && key.name === "l") {
      this.labelPickerOpen = true
      this.labelSearch = ""
      this.labelSelectedIndex = 0
      this.message = ""
      this.requestRender()
      return true
    }

    if (key.ctrl && key.name === "s") {
      const title = this.title.trim()
      if (!title) {
        this.message = "Title is required."
        this.requestRender()
        return true
      }

      this.onSubmit({ repository: this.repository, title, body: this.body.trim(), labels: this.selectedLabels })
      return true
    }

    if (key.name === "tab") {
      this.activeField = this.activeField === "title" ? "body" : "title"
      this.requestRender()
      return true
    }

    if (key.name === "return" || key.name === "linefeed") {
      if (this.activeField === "title") {
        this.activeField = "body"
      } else {
        this.body += "\n"
      }
      this.requestRender()
      return true
    }

    if (key.name === "backspace") {
      if (this.activeField === "title") {
        this.title = this.title.slice(0, -1)
      } else {
        this.body = this.body.slice(0, -1)
      }
      this.requestRender()
      return true
    }

    if (key.name === "space") {
      this.appendText(" ")
      return true
    }

    if (!key.ctrl && !key.meta && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.appendText(key.raw)
      return true
    }

    return true
  }

  protected renderSelf(buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.backgroundColor)
      this.drawBox()
      this.frameBuffer.drawText(" New GitHub Issue ", 2, 0, this.titleColor)
      this.frameBuffer.drawText(`Repository: ${this.repository}`, 2, 2, this.labelColor)
      this.drawSelectedLabels(4)
      this.drawField("title", "Title", this.title, 6, 1)
      this.drawField("body", "Body", this.body || "Optional description", 8, Math.max(3, this.height - 12))

      const help = "Tab switch fields · Ctrl+L labels · Ctrl+S create · Esc cancel"
      this.frameBuffer.drawText(help, 2, this.height - 3, this.mutedColor)
      if (this.message) {
        const color = this.message === "Title is required." ? this.errorColor : this.labelColor
        this.frameBuffer.drawText(truncate(this.message, this.width - 4), 2, this.height - 2, color)
      }

      if (this.labelPickerOpen) this.drawLabelPicker()
    }
  }

  private handleLabelPickerKeyPress(key: KeyEvent): boolean {
    if (key.name === "escape") {
      this.labelPickerOpen = false
      this.requestRender()
      return true
    }

    if (key.name === "up" || key.name === "k") {
      this.moveLabelSelection(-1)
      return true
    }

    if (key.name === "down" || key.name === "j") {
      this.moveLabelSelection(1)
      return true
    }

    if (key.name === "return" || key.name === "linefeed" || key.name === "space") {
      this.toggleCurrentLabel()
      return true
    }

    if (key.name === "backspace") {
      this.labelSearch = this.labelSearch.slice(0, -1)
      this.labelSelectedIndex = 0
      this.requestRender()
      return true
    }

    if (!key.ctrl && !key.meta && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.labelSearch += key.raw.replace(/[\r\n]/g, "")
      this.labelSelectedIndex = 0
      this.requestRender()
      return true
    }

    return true
  }

  private appendText(value: string): void {
    if (this.activeField === "title") {
      this.title += value.replace(/[\r\n]/g, "")
    } else {
      this.body += value
    }
    this.message = ""
    this.requestRender()
  }

  private drawSelectedLabels(y: number): void {
    this.frameBuffer?.drawText("Labels", 2, y, this.labelColor)
    const labels = this.selectedLabels.length > 0 ? this.selectedLabels.join(", ") : "none selected"
    this.frameBuffer?.drawText(truncate(labels, this.width - 12), 10, y, this.selectedLabels.length > 0 ? this.textColor : this.mutedColor)
  }

  private filteredLabels(): ReadonlyArray<GitHubLabel> {
    const search = labelKey(this.labelSearch)
    if (!search) return this.availableLabels
    return this.availableLabels.filter((label) => labelKey(label.name).includes(search))
  }

  private labelPickerOptions(): ReadonlyArray<{ readonly kind: "label" | "create"; readonly name: string; readonly color: string }> {
    const filtered = this.filteredLabels().map((label) => ({ kind: "label" as const, name: label.name, color: label.color }))
    const search = this.labelSearch.trim()
    const hasExactMatch = this.availableLabels.some((label) => labelKey(label.name) === labelKey(search))
    if (!search || hasExactMatch) return filtered
    return [{ kind: "create", name: search, color: "" }, ...filtered]
  }

  private moveLabelSelection(delta: number): void {
    const options = this.labelPickerOptions()
    if (options.length === 0) return

    this.labelSelectedIndex = Math.max(0, Math.min(this.labelSelectedIndex + delta, options.length - 1))
    this.requestRender()
  }

  private toggleCurrentLabel(): void {
    const option = this.labelPickerOptions()[this.labelSelectedIndex]
    if (!option) return

    const selected = this.selectedLabels.some((label) => labelKey(label) === labelKey(option.name))
    this.selectedLabels = selected
      ? this.selectedLabels.filter((label) => labelKey(label) !== labelKey(option.name))
      : uniqueLabels([...this.selectedLabels, option.name])
    this.labelSearch = option.kind === "create" ? "" : this.labelSearch
    this.requestRender()
  }

  private drawLabelPicker(): void {
    const left = 4
    const top = 3
    const width = Math.max(20, this.width - 8)
    const height = Math.max(8, this.height - 6)
    const options = this.labelPickerOptions()
    this.labelSelectedIndex = Math.min(this.labelSelectedIndex, Math.max(0, options.length - 1))

    this.frameBuffer?.fillRect(left, top, width, height, parseColor("#0d1117"))
    this.frameBuffer?.fillRect(left, top, width, 1, this.borderColor)
    this.frameBuffer?.fillRect(left, top + height - 1, width, 1, this.borderColor)
    this.frameBuffer?.drawText(" Labels ", left + 2, top, this.titleColor)
    this.frameBuffer?.drawText(`Search: ${this.labelSearch}_`, left + 2, top + 2, this.activeColor)

    const listTop = top + 4
    const listHeight = Math.max(0, height - 6)
    if (options.length === 0) {
      this.frameBuffer?.drawText("Type a label name to create it", left + 2, listTop, this.mutedColor)
    }

    options.slice(0, listHeight).forEach((option, index) => {
      const selected = index === this.labelSelectedIndex
      const checked = this.selectedLabels.some((label) => labelKey(label) === labelKey(option.name))
      const y = listTop + index
      if (selected) this.frameBuffer?.fillRect(left + 1, y, width - 2, 1, this.activeColor)

      const prefix = option.kind === "create" ? "+" : checked ? "x" : " "
      const text = `${prefix} ${option.kind === "create" ? `Create \"${option.name}\"` : option.name}`
      this.frameBuffer?.drawText(truncate(text, width - 4), left + 2, y, selected ? parseColor("#ffffff") : this.textColor)
    })

    this.frameBuffer?.drawText("Enter/Space toggle · Esc close", left + 2, top + height - 2, this.mutedColor)
  }

  private drawBox(): void {
    this.frameBuffer?.fillRect(0, 0, this.width, 1, this.borderColor)
    this.frameBuffer?.fillRect(0, this.height - 1, this.width, 1, this.borderColor)
    for (let y = 1; y < this.height - 1; y++) {
      this.frameBuffer?.drawText("│", 0, y, this.borderColor)
      this.frameBuffer?.drawText("│", this.width - 1, y, this.borderColor)
    }
  }

  private drawField(field: IssueCreatorField, label: string, value: string, labelY: number, height: number): void {
    const active = this.activeField === field
    const y = labelY + 1
    this.frameBuffer?.drawText(`${label}${active ? " *" : ""}`, 2, labelY, active ? this.activeColor : this.labelColor)
    this.frameBuffer?.fillRect(2, y, this.width - 4, height, parseColor(active ? "#161b22" : "#0d1117"))

    const lines = value.split("\n").slice(0, height)
    lines.forEach((line, index) => {
      const color = field === "body" && !this.body ? this.mutedColor : this.textColor
      this.frameBuffer?.drawText(truncate(line, this.width - 6), 3, y + index, color)
    })

    if (active && !this.submitting) {
      const lastLine = lines.at(-1) ?? ""
      const cursorY = y + Math.min(lines.length - 1, height - 1)
      const cursorX = Math.min(3 + lastLine.length, this.width - 4)
      this.frameBuffer?.drawText("_", cursorX, cursorY, this.activeColor)
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

  const bodyHeight = Math.max(8, renderer.terminalHeight - 6)

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
    height: bodyHeight,
    flexDirection: "row",
    gap: 1,
    marginTop: 1,
  })
  container.add(body)

  const issueList = new IssueListRenderable(renderer, {
    id: "issue-list",
    width: Math.max(48, Math.floor(renderer.terminalWidth * 0.58)),
    height: bodyHeight,
    onSelectionChange: (option) => {
      details.setOption(option)
    },
  })
  body.add(issueList)

  const details = new IssueDetailsRenderable(renderer, {
    id: "details",
    width: "auto",
    height: Math.max(7, bodyHeight - 1),
    marginTop: 1,
  })
  body.add(details)

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: "↑/↓ or j/k to move · enter to select · Ctrl+N new issue · r to refresh · q to quit",
    height: 1,
    fg: "#8b949e",
  })
  container.add(footer)

  const issueCreator = new IssueCreatorRenderable(renderer, {
    id: "issue-creator",
    position: "absolute",
    left: Math.max(2, Math.floor((renderer.terminalWidth - Math.min(82, renderer.terminalWidth - 4)) / 2)),
    top: Math.max(2, Math.floor((renderer.terminalHeight - Math.min(20, renderer.terminalHeight - 4)) / 2)),
    width: Math.min(82, renderer.terminalWidth - 4),
    height: Math.min(20, renderer.terminalHeight - 4),
    zIndex: 20,
    onSubmit: (draft) => createIssueFromDraft(shell, draft),
    onCancel: () => {
      status.content = "Issue creation cancelled."
      issueList.focus()
    },
  })
  renderer.root.add(issueCreator)

  issueList.focus()

  const shell = { status, issueList, details, issueCreator, footer }
  return shell
}

const expandSelectedIssue = (shell: ReturnType<typeof createShell>): void => {
  if (!shell.issueList.getSelectedOption()) {
    shell.status.content = "Select an issue before expanding details."
    return
  }

  shell.issueList.visible = false
  shell.details.width = "100%"
  shell.details.setExpanded(true)
  shell.footer.content = "Esc collapse issue · Ctrl+N new issue · r to refresh · q to quit"
  shell.status.content = "Issue expanded."
}

const collapseSelectedIssue = (shell: ReturnType<typeof createShell>): void => {
  shell.issueList.visible = true
  shell.details.width = "auto"
  shell.details.setExpanded(false)
  shell.footer.content = "↑/↓ or j/k to move · enter to select · Ctrl+N new issue · r to refresh · q to quit"
  shell.status.content = "Issue list restored."
  shell.issueList.focus()
}

const refreshIssues = (shell: ReturnType<typeof createShell>): void => {
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

const openIssueCreatorForSelectedRepository = (shell: ReturnType<typeof createShell>): void => {
  const selectedOption = shell.issueList.getSelectedOption()
  if (!selectedOption) {
    shell.status.content = "Select a repository issue before creating a new issue."
    return
  }

  const { repository } = selectedOption.value as IssueOptionValue
  shell.status.content = `Creating a new issue in ${repository}.`
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

const createIssueFromDraft = (shell: ReturnType<typeof createShell>, draft: IssueDraft): void => {
  shell.status.content = `Creating issue in ${draft.repository}...`
  shell.issueCreator.setSubmitting(true)

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
    if (result._tag === "Failure") {
      shell.status.content = "Unable to create issue."
      shell.issueCreator.setMessage(result.message)
      return
    }

    shell.issueCreator.close()
    shell.issueList.focus()
    shell.status.content = `Created issue in ${draft.repository}. Press r to refresh.`
    shell.details.setMessage(result.result.url)
  })
}

const main = async (): Promise<void> => {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const shell = createShell(renderer)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
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
  })

  refreshIssues(shell)
  renderer.start()
}

await main()
