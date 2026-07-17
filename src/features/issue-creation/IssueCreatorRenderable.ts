import {
  OptimizedBuffer,
  parseColor,
  Renderable,
  RGBA,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
} from "@opentui/core"
import type { GitHubLabel } from "../../services/GitHubIssues.js"
import { theme } from "../../ui/theme.js"
import { truncate } from "../../ui/text.js"
import type { IssueDraft } from "./model.js"

type IssueCreatorField = "title" | "body"

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

export class IssueCreatorRenderable extends Renderable {
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
  private labelScrollOffset = 0
  private message = ""
  private submitting = false
  private readonly backgroundColor = parseColor(theme.background)
  private readonly panelColor = parseColor(theme.surface)
  private readonly titleColor = parseColor(theme.text)
  private readonly labelColor = parseColor(theme.textMuted)
  private readonly textColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textSubtle)
  private readonly activeColor = parseColor(theme.blue)
  private readonly errorColor = parseColor(theme.error)
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
    this.labelScrollOffset = 0
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

  public isOpenForRepository(repository: string): boolean {
    return this.visible && this.repository === repository
  }

  public setSubmitting(submitting: boolean): void {
    this.submitting = submitting
    this.message = submitting ? "Creating issue..." : ""
    this.requestRender()
  }

  public setAvailableLabels(labels: ReadonlyArray<GitHubLabel>): void {
    this.availableLabels = [...labels].sort((left, right) => left.name.localeCompare(right.name))
    this.labelSelectedIndex = 0
    this.labelScrollOffset = 0
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

    if (!key.ctrl && !key.meta && !key.option && key.name === "f2") {
      this.labelPickerOpen = true
      this.labelSearch = ""
      this.labelSelectedIndex = 0
      this.labelScrollOffset = 0
      this.message = ""
      this.requestRender()
      return true
    }

    if (!key.ctrl && !key.meta && !key.option && key.name === "f3") {
      const title = this.title.trim()
      if (!title) {
        this.message = "Title is required."
        this.requestRender()
        return true
      }

      this.onSubmit({
        repository: this.repository,
        title,
        body: this.body.trim(),
        labels: this.selectedLabels,
      })
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
      this.frameBuffer.clear(this.panelColor)
      this.frameBuffer.drawText(" New GitHub Issue ", 2, 1, this.titleColor)
      this.frameBuffer.drawText(`Repository: ${this.repository}`, 3, 3, this.labelColor)
      this.drawSelectedLabels(5)
      this.drawField("title", "Title", this.title, 7, 1)
      this.drawField("body", "Body", this.body || "Optional description", 9, Math.max(3, this.height - 13))

      const help = "Tab switch fields · F2 labels · F3 create · Esc cancel"
      this.frameBuffer.drawText(help, 3, this.height - 3, this.mutedColor)
      if (this.message) {
        const color = this.message === "Title is required." ? this.errorColor : this.labelColor
        this.frameBuffer.drawText(truncate(this.message, this.width - 5), 3, this.height - 2, color)
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

    if (key.name === "up") {
      this.moveLabelSelection(-1)
      return true
    }

    if (key.name === "down") {
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
      this.labelScrollOffset = 0
      this.requestRender()
      return true
    }

    if (!key.ctrl && !key.meta && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.labelSearch += key.raw.replace(/[\r\n]/g, "")
      this.labelSelectedIndex = 0
      this.labelScrollOffset = 0
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
    this.frameBuffer?.drawText("Labels", 3, y, this.labelColor)
    const labels = this.selectedLabels.length > 0 ? this.selectedLabels.join(", ") : "none selected"
    this.frameBuffer?.drawText(
      truncate(labels, this.width - 13),
      11,
      y,
      this.selectedLabels.length > 0 ? this.textColor : this.mutedColor,
    )
  }

  private filteredLabels(): ReadonlyArray<GitHubLabel> {
    const search = labelKey(this.labelSearch)
    if (!search) return this.availableLabels
    return this.availableLabels.filter((label) => labelKey(label.name).includes(search))
  }

  private labelPickerOptions(): ReadonlyArray<{
    readonly kind: "label" | "create"
    readonly name: string
    readonly color: string
  }> {
    const filtered = this.filteredLabels().map((label) => ({
      kind: "label" as const,
      name: label.name,
      color: label.color,
    }))
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
    if (option.kind === "create") {
      this.labelSearch = ""
      this.labelSelectedIndex = 0
      this.labelScrollOffset = 0
    }
    this.requestRender()
  }

  private drawLabelPicker(): void {
    const left = 4
    const top = 3
    const width = Math.max(20, this.width - 8)
    const height = Math.max(8, this.height - 6)
    const options = this.labelPickerOptions()
    this.labelSelectedIndex = Math.min(this.labelSelectedIndex, Math.max(0, options.length - 1))

    this.frameBuffer?.fillRect(0, 0, this.width, this.height, RGBA.fromInts(0, 0, 0, 150))
    this.frameBuffer?.fillRect(left, top, width, height, parseColor(theme.surfaceRaised))
    this.frameBuffer?.drawText(" Labels ", left + 2, top + 1, this.titleColor)
    this.frameBuffer?.drawText(`Search: ${this.labelSearch}_`, left + 2, top + 3, this.activeColor)

    const listTop = top + 5
    const listHeight = Math.max(0, height - 7)
    this.updateLabelScrollOffset(listHeight)
    if (options.length === 0) {
      this.frameBuffer?.drawText("Type a label name to create it", left + 2, listTop, this.mutedColor)
    }

    options.slice(this.labelScrollOffset, this.labelScrollOffset + listHeight).forEach((option, index) => {
      const optionIndex = this.labelScrollOffset + index
      const selected = optionIndex === this.labelSelectedIndex
      const checked = this.selectedLabels.some((label) => labelKey(label) === labelKey(option.name))
      const y = listTop + index
      if (selected) this.frameBuffer?.fillRect(left + 1, y, width - 2, 1, this.activeColor)

      const prefix = option.kind === "create" ? "+" : checked ? "x" : " "
      const text = `${prefix} ${option.kind === "create" ? `Create \"${option.name}\"` : option.name}`
      this.frameBuffer?.drawText(
        truncate(text, width - 4),
        left + 2,
        y,
        selected ? parseColor("#ffffff") : this.textColor,
      )
    })

    this.frameBuffer?.drawText("Enter/Space toggle · Esc close", left + 2, top + height - 2, this.mutedColor)
  }

  private updateLabelScrollOffset(listHeight: number): void {
    if (listHeight <= 0) {
      this.labelScrollOffset = 0
      return
    }

    if (this.labelSelectedIndex < this.labelScrollOffset) {
      this.labelScrollOffset = this.labelSelectedIndex
    } else if (this.labelSelectedIndex >= this.labelScrollOffset + listHeight) {
      this.labelScrollOffset = this.labelSelectedIndex - listHeight + 1
    }
  }

  private drawField(field: IssueCreatorField, label: string, value: string, labelY: number, height: number): void {
    const active = this.activeField === field
    const y = labelY + 1
    const contentWidth = Math.max(0, this.width - 6)
    this.frameBuffer?.drawText(`${label}${active ? " *" : ""}`, 3, labelY, active ? this.activeColor : this.labelColor)
    this.frameBuffer?.fillRect(2, y, this.width - 4, height, this.backgroundColor)

    const allLines = value.split("\n")
    const lineOffset = active ? Math.max(0, allLines.length - height) : 0
    const lines = allLines.slice(lineOffset, lineOffset + height)
    lines.forEach((line, index) => {
      const color = field === "body" && !this.body ? this.mutedColor : this.textColor
      const isCursorLine = active && lineOffset + index === allLines.length - 1
      const visibleLine = isCursorLine
        ? line.slice(Math.max(0, line.length - contentWidth))
        : truncate(line, contentWidth)
      this.frameBuffer?.drawText(visibleLine, 3, y + index, color)
    })

    if (active && !this.submitting) {
      const lastLine = lines.at(-1) ?? ""
      const cursorY = y + Math.min(lines.length - 1, height - 1)
      const cursorX = 3 + Math.min(lastLine.length, contentWidth)
      this.frameBuffer?.drawText("_", cursorX, cursorY, this.activeColor)
    }
  }
}
