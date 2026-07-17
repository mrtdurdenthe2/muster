import {
  OptimizedBuffer,
  parseColor,
  Renderable,
  type CliRenderer,
  type RenderableOptions,
  type TabSelectOption,
} from "@opentui/core"
import { theme } from "../../ui/theme.js"
import { truncate } from "../../ui/text.js"

interface IssueTabBarOptions extends Omit<RenderableOptions<IssueTabBarRenderable>, "height"> {
  readonly options?: ReadonlyArray<TabSelectOption>
  readonly tabWidth?: number
  readonly onSelectionChange: (index: number) => void
}

export class IssueTabBarRenderable extends Renderable {
  private _options: TabSelectOption[]
  private selectedIndex = 0
  private scrollOffset = 0
  private readonly tabWidth: number
  private readonly onSelectionChange: (index: number) => void
  private readonly backgroundColor = parseColor(theme.background)
  private readonly activeMarkerColor = parseColor(theme.blue)
  private readonly activeTextColor = parseColor(theme.blueText)
  private readonly inactiveTextColor = parseColor(theme.textMuted)
  private readonly scrollArrowColor = parseColor(theme.textSubtle)

  constructor(ctx: CliRenderer, options: IssueTabBarOptions) {
    super(ctx, { ...options, height: 1, buffered: true })
    this._options = [...(options.options ?? [])]
    this.tabWidth = options.tabWidth ?? 24
    this.onSelectionChange = options.onSelectionChange
  }

  public setOptions(options: ReadonlyArray<TabSelectOption>): void {
    this._options = [...options]
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this._options.length - 1))
    this.updateScrollOffset()
    this.requestRender()
  }

  public setSelectedIndex(index: number): void {
    if (index < 0 || index >= this._options.length) return

    this.selectedIndex = index
    this.updateScrollOffset()
    this.requestRender()
    this.onSelectionChange(index)
  }

  public moveLeft(): void {
    if (this._options.length === 0) return
    this.setSelectedIndex(this.selectedIndex === 0 ? this._options.length - 1 : this.selectedIndex - 1)
  }

  public moveRight(): void {
    if (this._options.length === 0) return
    this.setSelectedIndex(this.selectedIndex === this._options.length - 1 ? 0 : this.selectedIndex + 1)
  }

  protected renderSelf(_buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.backgroundColor)
      if (this._options.length === 0 || this.width <= 0) return

      const { contentLeft, maxVisibleTabs, renderedTabWidth, showScrollArrows } = this.layout()
      const visibleOptions = this._options.slice(this.scrollOffset, this.scrollOffset + maxVisibleTabs)

      visibleOptions.forEach((option, visibleIndex) => {
        const index = this.scrollOffset + visibleIndex
        const x = contentLeft + visibleIndex * renderedTabWidth
        const width = Math.min(renderedTabWidth, this.width - contentLeft - visibleIndex * renderedTabWidth)
        if (width <= 2) return

        const active = index === this.selectedIndex
        if (active) this.frameBuffer?.drawText("┃", x, 0, this.activeMarkerColor)
        this.frameBuffer?.drawText(
          truncate(option.name, width - 2),
          x + 2,
          0,
          active ? this.activeTextColor : this.inactiveTextColor,
        )
      })

      if (showScrollArrows) {
        if (this.scrollOffset > 0) this.frameBuffer.drawText("‹", 0, 0, this.scrollArrowColor)
        if (this.scrollOffset + maxVisibleTabs < this._options.length) {
          this.frameBuffer.drawText("›", this.width - 1, 0, this.scrollArrowColor)
        }
      }
    }
  }

  protected onResize(width: number, height: number): void {
    super.onResize(width, height)
    this.updateScrollOffset()
  }

  private layout(): {
    readonly contentLeft: number
    readonly maxVisibleTabs: number
    readonly renderedTabWidth: number
    readonly showScrollArrows: boolean
  } {
    const maxVisibleTabs = Math.max(1, Math.floor(this.width / this.tabWidth))
    const showScrollArrows = this._options.length > maxVisibleTabs
    const contentWidth = Math.max(1, this.width - (showScrollArrows ? 2 : 0))
    return {
      contentLeft: showScrollArrows ? 1 : 0,
      maxVisibleTabs,
      renderedTabWidth: showScrollArrows ? Math.max(1, Math.floor(contentWidth / maxVisibleTabs)) : this.tabWidth,
      showScrollArrows,
    }
  }

  private updateScrollOffset(): void {
    const { maxVisibleTabs } = this.layout()
    const maxOffset = Math.max(0, this._options.length - maxVisibleTabs)

    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex
    } else if (this.selectedIndex >= this.scrollOffset + maxVisibleTabs) {
      this.scrollOffset = this.selectedIndex - maxVisibleTabs + 1
    }
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)
  }
}
