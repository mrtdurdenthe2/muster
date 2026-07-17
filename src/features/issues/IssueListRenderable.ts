import {
  OptimizedBuffer,
  parseColor,
  Renderable,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
} from "@opentui/core"
import { theme } from "../../ui/theme.js"
import type { IssueOption } from "./issueOption.js"

interface IssueListRow {
  readonly kind: "header" | "issue"
  readonly repository?: string
  readonly option?: IssueOption
  readonly optionIndex?: number
}

const issuesGroupedByRepository = (options: ReadonlyArray<IssueOption>): ReadonlyArray<IssueListRow> => {
  const rows: IssueListRow[] = []
  let currentRepository: string | null = null

  options.forEach((option, optionIndex) => {
    const value = option.value
    if (value.repository !== currentRepository) {
      currentRepository = value.repository
      rows.push({ kind: "header", repository: currentRepository })
    }
    rows.push({ kind: "issue", option, optionIndex })
  })

  return rows
}

export class IssueListRenderable extends Renderable {
  protected _focusable = true

  private _options: IssueOption[] = []
  private rows: ReadonlyArray<IssueListRow> = []
  private selectedIndex = 0
  private scrollOffset = 0
  private readonly backgroundColor = parseColor(theme.surface)
  private readonly headerBackgroundColor = parseColor(theme.background)
  private readonly headerTextColor = parseColor(theme.textMuted)
  private readonly textColor = parseColor(theme.text)
  private readonly selectedBackgroundColor = parseColor(theme.surfaceSelected)
  private readonly selectedTextColor = parseColor(theme.blueText)
  private readonly descriptionColor = parseColor(theme.textMuted)
  private readonly selectedDescriptionColor = parseColor(theme.blueMuted)
  private readonly borderColor = parseColor(theme.background)
  private readonly selectedColor = parseColor(theme.blue)
  private readonly onSelectionChange: (option: IssueOption | null) => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<IssueListRenderable> & {
      onSelectionChange: (option: IssueOption | null) => void
    },
  ) {
    super(ctx, { ...options, buffered: true })
    this.onSelectionChange = options.onSelectionChange
  }

  public get options(): ReadonlyArray<IssueOption> {
    return this._options
  }

  public set options(options: ReadonlyArray<IssueOption>) {
    this._options = [...options]
    this.rows = issuesGroupedByRepository(this._options)
    this.selectedIndex = this._options.length > 0 ? Math.min(this.selectedIndex, this._options.length - 1) : 0
    this.updateScrollOffset()
    this.onSelectionChange(this.getSelectedOption())
    this.requestRender()
  }

  public getSelectedOption(): IssueOption | null {
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
      this.frameBuffer.fillRect(Math.max(0, this.width - 1), 0, 1, this.height, this.borderColor)
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
            this.frameBuffer.fillRect(0, y, Math.max(0, this.width - 1), 1, this.headerBackgroundColor)
            this.frameBuffer.drawText(`  ${row.repository?.toUpperCase() ?? ""}`, 0, y, this.headerTextColor)
          }
        } else if (row.option && row.optionIndex !== undefined) {
          const selected = row.optionIndex === this.selectedIndex
          const bgColor = selected ? this.selectedBackgroundColor : this.backgroundColor
          const titleColor = selected ? this.selectedTextColor : this.textColor
          const descriptionColor = selected ? this.selectedDescriptionColor : this.descriptionColor
          if (y >= 0) {
            this.frameBuffer.fillRect(0, y, Math.max(0, this.width - 1), Math.min(2, this.height - y), bgColor)
            if (selected) this.frameBuffer.fillRect(0, y, 1, Math.min(2, this.height - y), this.selectedColor)
            this.frameBuffer.drawText(`  ${row.option.name}`, 1, y, titleColor)
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
