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
import { type IssueOption, issueOptionKey } from "./issueOption.js"

export class IssueCloseConfirmationRenderable extends Renderable {
  protected _focusable = true

  private option: IssueOption | null = null
  private submitting = false
  private message = ""
  private readonly panelColor = parseColor(theme.surface)
  private readonly titleColor = parseColor(theme.error)
  private readonly textColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textSubtle)
  private readonly activeColor = parseColor(theme.blueText)
  private readonly errorColor = parseColor(theme.error)
  private readonly onConfirm: (option: IssueOption) => void
  private readonly onCancel: () => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<IssueCloseConfirmationRenderable> & {
      readonly onConfirm: (option: IssueOption) => void
      readonly onCancel: () => void
    },
  ) {
    super(ctx, { ...options, buffered: true, visible: false })
    this.onConfirm = options.onConfirm
    this.onCancel = options.onCancel
  }

  public open(option: IssueOption): void {
    this.option = option
    this.submitting = false
    this.message = ""
    this.visible = true
    this.focus()
    this.requestRender()
  }

  public close(): void {
    this.visible = false
    this.requestRender()
  }

  public isOpenFor(option: IssueOption): boolean {
    return this.visible && this.option !== null && issueOptionKey(this.option) === issueOptionKey(option)
  }

  public setMessage(message: string): void {
    this.submitting = false
    this.message = message
    this.requestRender()
  }

  public handleKeyPress(key: KeyEvent): boolean {
    if (!this.visible || this.submitting) return this.visible

    if (key.name === "escape" || key.name === "n") {
      this.close()
      this.onCancel()
      return true
    }

    if (!key.ctrl && !key.meta && !key.option && key.name === "y" && this.option) {
      this.submitting = true
      this.message = "Closing issue..."
      this.requestRender()
      this.onConfirm(this.option)
      return true
    }

    return true
  }

  protected renderSelf(_buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer || !this.isDirty) return

    this.frameBuffer.clear(this.panelColor)
    this.frameBuffer.drawText(" Close issue? ", 2, 1, this.titleColor)

    if (this.option) {
      const value = this.option.value
      this.frameBuffer.drawText(
        truncate(`${value.repository} #${value.issue.number} · ${value.issue.title}`, Math.max(0, this.width - 6)),
        3,
        3,
        this.textColor,
      )
    }

    this.frameBuffer.drawText("y close · n/Esc cancel", 3, 5, this.activeColor)
    if (this.message) {
      this.frameBuffer.drawText(
        truncate(this.message, Math.max(0, this.width - 6)),
        3,
        6,
        this.submitting ? this.mutedColor : this.errorColor,
      )
    }
  }
}
