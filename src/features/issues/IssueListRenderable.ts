import {
  OptimizedBuffer,
  parseColor,
  Renderable,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
} from "@opentui/core"
import { theme } from "../../ui/theme.js"
import { truncate } from "../../ui/text.js"
import { type IssueOption, issueMatchesSearch, issueOptionKey } from "./issueOption.js"
import type { IssueStateFilter } from "./issueTab.js"

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

  private sourceOptions: IssueOption[] = []
  private _options: IssueOption[] = []
  private rows: ReadonlyArray<IssueListRow> = []
  private selectedIndex = 0
  private scrollOffset = 0
  private searchQuery = ""
  private _searching = false
  private _loading = false
  private _issueStateFilter: IssueStateFilter
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
  private readonly stateBlueBackgroundColor = parseColor(theme.blueSurfaceSubtle)
  private readonly stateRedBackgroundColor = parseColor(theme.redSurfaceSubtle)
  private readonly stateClosedTextColor = parseColor(theme.error)
  private readonly onSelectionChange: (option: IssueOption | null) => void
  private readonly onSearchChange: (query: string) => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<IssueListRenderable> & {
      onSelectionChange: (option: IssueOption | null) => void
      onSearchChange?: (query: string) => void
      issueStateFilter?: IssueStateFilter
    },
  ) {
    super(ctx, { ...options, buffered: true })
    this.onSelectionChange = options.onSelectionChange
    this.onSearchChange = options.onSearchChange ?? (() => {})
    this._issueStateFilter = options.issueStateFilter ?? "open"
  }

  public get options(): ReadonlyArray<IssueOption> {
    return this._options
  }

  public set options(options: ReadonlyArray<IssueOption>) {
    const selected = this.getSelectedOption()
    this.sourceOptions = [...options]
    this.applySearch(selected)
  }

  public updateIssueOption(option: IssueOption, include: boolean): void {
    const key = issueOptionKey(option)
    const selected = this.getSelectedOption()
    this.sourceOptions = include
      ? this.sourceOptions.map((candidate) => issueOptionKey(candidate) === key ? option : candidate)
      : this.sourceOptions.filter((candidate) => issueOptionKey(candidate) !== key)
    this.applySearch(selected && issueOptionKey(selected) === key ? option : selected)
  }

  public get searching(): boolean {
    return this._searching
  }

  public get query(): string {
    return this.searchQuery
  }

  public get issueStateFilter(): IssueStateFilter {
    return this._issueStateFilter
  }

  public get loading(): boolean {
    return this._loading
  }

  public set loading(value: boolean) {
    if (this._loading === value) return
    this._loading = value
    this.requestRender()
  }

  public set issueStateFilter(value: IssueStateFilter) {
    if (this._issueStateFilter === value) return
    this._issueStateFilter = value
    this.requestRender()
  }

  public getSelectedOption(): IssueOption | null {
    return this._options[this.selectedIndex] ?? null
  }

  public handleKeyPress(key: KeyEvent): boolean {
    if (this._searching) return this.handleSearchKeyPress(key)
    if (!key.ctrl && !key.meta && !key.option && (key.name === "/" || key.raw === "/")) {
      this._searching = true
      this.updateScrollOffset()
      this.requestRender()
      return true
    }
    if (key.name === "escape" && this.searchQuery) {
      this.setSearchQuery("")
      return true
    }
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
      const showSearch = this._searching || this.searchQuery.length > 0
      let y = (showSearch ? 1 : 0) - this.scrollOffset

      if (showSearch && this.height > 0) {
        this.frameBuffer.fillRect(0, 0, Math.max(0, this.width - 1), 1, this.headerBackgroundColor)
        const prompt = this.searchQuery || "name, author, #number, tag"
        const cursor = this._searching ? "_" : ""
        const count = `${this._options.length}/${this.sourceOptions.length}`
        const available = Math.max(0, this.width - count.length - cursor.length - 5)
        this.frameBuffer.drawText(` / ${prompt.slice(0, available)}${cursor}`, 0, 0, this.selectedTextColor)
        this.frameBuffer.drawText(count, Math.max(0, this.width - count.length - 2), 0, this.descriptionColor)
      }

      if (this.rows.length === 0 && y >= 0 && y < this.height) {
        this.frameBuffer.drawText(this._loading ? "  Loading issues..." : "  No matching issues", 0, y, this.descriptionColor)
      }

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
            const stateTag = ` ${this._issueStateFilter.toUpperCase()} `
            const stateX = Math.max(2, this.width - stateTag.length - 2)
            const repository = truncate(row.repository?.toUpperCase() ?? "", Math.max(0, stateX - 3))
            this.frameBuffer.drawText(`  ${repository}`, 0, y, this.headerTextColor)
            const closed = this._issueStateFilter === "closed"
            this.frameBuffer.fillRect(
              stateX,
              y,
              stateTag.length,
              1,
              closed ? this.stateRedBackgroundColor : this.stateBlueBackgroundColor,
            )
            this.frameBuffer.drawText(stateTag, stateX, y, closed ? this.stateClosedTextColor : this.selectedTextColor)
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

    const viewportHeight = Math.max(0, this.height - (this._searching || this.searchQuery ? 1 : 0))
    if (selectedTop < this.scrollOffset) {
      this.scrollOffset = selectedTop
    } else if (selectedBottom > this.scrollOffset + viewportHeight) {
      this.scrollOffset = Math.max(0, selectedBottom - viewportHeight)
    }
  }

  private handleSearchKeyPress(key: KeyEvent): boolean {
    if (key.name === "escape") {
      this._searching = false
      this.setSearchQuery("")
      return true
    }
    if (key.name === "return" || key.name === "linefeed") {
      this._searching = false
      this.updateScrollOffset()
      this.requestRender()
      return true
    }
    if (key.name === "up") return this.moveSelection(-1)
    if (key.name === "down") return this.moveSelection(1)
    if (key.name === "backspace") {
      this.setSearchQuery(this.searchQuery.slice(0, -1))
      return true
    }
    if (key.name === "space") {
      this.setSearchQuery(`${this.searchQuery} `)
      return true
    }
    if (!key.ctrl && !key.meta && !key.option && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.setSearchQuery(`${this.searchQuery}${key.raw}`)
      return true
    }
    return true
  }

  private setSearchQuery(query: string): void {
    const selected = this.getSelectedOption()
    this.searchQuery = query
    this.applySearch(selected)
    this.onSearchChange(query)
  }

  private applySearch(selected: IssueOption | null): void {
    this._options = this.searchQuery
      ? this.sourceOptions.filter((option) => issueMatchesSearch(option, this.searchQuery))
      : [...this.sourceOptions]
    this.rows = issuesGroupedByRepository(this._options)
    const selectedKey = selected ? issueOptionKey(selected) : null
    const preservedIndex = selectedKey
      ? this._options.findIndex((option) => issueOptionKey(option) === selectedKey)
      : -1
    this.selectedIndex = preservedIndex >= 0 ? preservedIndex : 0
    this.scrollOffset = 0
    this.updateScrollOffset()
    this.onSelectionChange(this.getSelectedOption())
    this.requestRender()
  }
}
