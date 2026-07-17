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
import type { CommentDraft } from "./commentDraft.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"

export class CommentComposerRenderable extends Renderable {
  protected _focusable = true

  private option: IssueOption | null = null
  private body = ""
  private message = ""
  private submitting = false
  private readonly panelColor = parseColor(theme.surface)
  private readonly fieldColor = parseColor(theme.background)
  private readonly titleColor = parseColor(theme.text)
  private readonly textColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textSubtle)
  private readonly activeColor = parseColor(theme.blue)
  private readonly errorColor = parseColor(theme.error)
  private readonly onSubmit: (draft: CommentDraft) => void
  private readonly onCancel: () => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<CommentComposerRenderable> & {
      readonly onSubmit: (draft: CommentDraft) => void
      readonly onCancel: () => void
    },
  ) {
    super(ctx, { ...options, buffered: true, visible: false })
    this.onSubmit = options.onSubmit
    this.onCancel = options.onCancel
  }

  public open(option: IssueOption): void {
    this.option = option
    this.body = ""
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

  public isOpenFor(option: IssueOption): boolean {
    return this.visible && this.option !== null && issueOptionKey(this.option) === issueOptionKey(option)
  }

  public setSubmitting(submitting: boolean): void {
    this.submitting = submitting
    this.message = submitting ? "Posting comment..." : ""
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

    if (key.name === "escape") {
      this.close()
      this.onCancel()
      return true
    }

    if (!key.ctrl && !key.meta && !key.option && key.name === "f3") {
      const body = this.body.trim()
      if (!body || !this.option) {
        this.message = "Comment is required."
        this.requestRender()
        return true
      }

      this.onSubmit({ option: this.option, body })
      return true
    }

    if (key.name === "return" || key.name === "linefeed") {
      this.body += "\n"
      this.message = ""
      this.requestRender()
      return true
    }

    if (key.name === "backspace") {
      this.body = this.body.slice(0, -1)
      this.message = ""
      this.requestRender()
      return true
    }

    if (key.name === "space") {
      this.appendText(" ")
      return true
    }

    if (!key.ctrl && !key.meta && !key.option && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.appendText(key.raw)
      return true
    }

    return true
  }

  protected renderSelf(_buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.panelColor)
      this.frameBuffer.drawText(" Add Comment ", 2, 1, this.titleColor)

      if (this.option) {
        const issue = this.option.value
        this.frameBuffer.drawText(
          truncate(`${issue.repository} #${issue.issue.number} · ${issue.issue.title}`, Math.max(0, this.width - 6)),
          3,
          3,
          this.mutedColor,
        )
      }

      const fieldTop = 5
      const fieldHeight = Math.max(1, this.height - 9)
      const fieldWidth = Math.max(0, this.width - 6)
      this.frameBuffer.drawText("Comment", 3, fieldTop - 1, this.activeColor)
      this.frameBuffer.fillRect(2, fieldTop, Math.max(0, this.width - 4), fieldHeight, this.fieldColor)

      const allLines = this.body.split("\n")
      const lineOffset = Math.max(0, allLines.length - fieldHeight)
      const lines = allLines.slice(lineOffset, lineOffset + fieldHeight)
      lines.forEach((line, index) => {
        const cursorLine = lineOffset + index === allLines.length - 1
        const visibleLine = cursorLine
          ? line.slice(Math.max(0, line.length - fieldWidth))
          : truncate(line, fieldWidth)
        this.frameBuffer?.drawText(visibleLine, 3, fieldTop + index, this.textColor)
      })

      if (!this.submitting) {
        const lastLine = lines.at(-1) ?? ""
        const cursorY = fieldTop + Math.min(lines.length - 1, fieldHeight - 1)
        const cursorX = 3 + Math.min(lastLine.length, fieldWidth)
        this.frameBuffer.drawText("_", cursorX, cursorY, this.activeColor)
      }

      this.frameBuffer.drawText("F3 post · Enter newline · Esc cancel", 3, this.height - 3, this.mutedColor)
      if (this.message) {
        this.frameBuffer.drawText(
          truncate(this.message, Math.max(0, this.width - 6)),
          3,
          this.height - 2,
          this.message === "Comment is required." ? this.errorColor : this.mutedColor,
        )
      }
    }
  }

  private appendText(value: string): void {
    this.body += value.replace(/\r/g, "")
    this.message = ""
    this.requestRender()
  }
}
