import { OptimizedBuffer, parseColor, Renderable, type CliRenderer, type RenderableOptions } from "@opentui/core"
import type { GitHubIssueComment } from "../../services/GitHubIssues.js"
import { labelBackgroundColor, labelTextColor, theme } from "../../ui/theme.js"
import { formatDate, limitedWrappedText, truncate, wrapText } from "../../ui/text.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"

type CommentState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Loaded"; readonly comments: ReadonlyArray<GitHubIssueComment> }
  | { readonly _tag: "Error"; readonly message: string }

export class IssueDetailsRenderable extends Renderable {
  private option: IssueOption | null = null
  private optionKey: string | null = null
  private commentState: CommentState = { _tag: "Idle" }
  private message = "Select an issue to see details."
  private expanded = false
  private readonly backgroundColor = parseColor(theme.background)
  private readonly barColor = parseColor(theme.surface)
  private readonly panelColor = parseColor(theme.background)
  private readonly borderColor = parseColor(theme.background)
  private readonly titleColor = parseColor(theme.text)
  private readonly textColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textMuted)
  private readonly linkColor = parseColor(theme.blueText)

  constructor(ctx: CliRenderer, options: RenderableOptions<IssueDetailsRenderable>) {
    super(ctx, { ...options, buffered: true })
  }

  public setOption(option: IssueOption | null): void {
    const nextKey = option ? issueOptionKey(option) : null
    if (nextKey !== this.optionKey) this.commentState = { _tag: "Idle" }

    this.option = option
    this.optionKey = nextKey
    this.message = option ? "" : "No issue selected."
    this.requestRender()
  }

  public setMessage(message: string): void {
    this.option = null
    this.optionKey = null
    this.commentState = { _tag: "Idle" }
    this.message = message
    this.requestRender()
  }

  public setExpanded(expanded: boolean): void {
    this.expanded = expanded
    this.requestRender()
  }

  public setCommentsLoading(key: string): void {
    if (key !== this.optionKey) return
    this.commentState = { _tag: "Loading" }
    this.requestRender()
  }

  public setComments(key: string, comments: ReadonlyArray<GitHubIssueComment>): void {
    if (key !== this.optionKey) return
    this.commentState = { _tag: "Loaded", comments }
    this.requestRender()
  }

  public setCommentsError(key: string, message: string): void {
    if (key !== this.optionKey) return
    this.commentState = { _tag: "Error", message }
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

      const value = this.option.value
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
      const commentLines = this.commentTreeLines(contentWidth)
      const availableContentHeight = Math.max(0, contentHeight - 5)
      const commentHeight = Math.min(commentLines.length, Math.max(2, Math.ceil(availableContentHeight * 0.6)))
      const bodyHeight = Math.max(1, availableContentHeight - commentHeight - 1)
      const detailLines = [
        `Author: ${value.issue.user.login}`,
        `State: ${value.issue.state}`,
        `Updated: ${formatDate(value.issue.updated_at)}`,
        value.issue.html_url,
        "",
        ...limitedWrappedText(body, contentWidth, bodyHeight),
        "",
        ...commentLines,
      ]

      detailLines.slice(0, contentHeight).forEach((line, index) => {
        const y = index + 4
        const color =
          line === value.issue.html_url || line === "Comments"
            ? this.linkColor
            : line.startsWith("├─") || line.startsWith("└─")
              ? this.titleColor
              : line === "" ||
                  line.includes("Loading comments") ||
                  line.includes("No comments") ||
                  line.includes("Unable to load")
                ? this.mutedColor
                : this.textColor
        this.frameBuffer?.drawText(truncate(line, contentWidth), 2, y, color)
      })
    }
  }

  private commentTreeLines(width: number): ReadonlyArray<string> {
    if (this.commentState._tag === "Idle" || this.commentState._tag === "Loading") {
      return ["Comments", "└─ Loading comments..."]
    }
    if (this.commentState._tag === "Error") {
      return ["Comments", `└─ Unable to load comments: ${this.commentState.message}`]
    }
    const comments = this.commentState.comments
    if (comments.length === 0) {
      return ["Comments", "└─ No comments"]
    }

    return comments.flatMap((comment, index) => {
      const last = index === comments.length - 1
      const branch = last ? "└─" : "├─"
      const continuation = last ? "  " : "│ "
      const body = comment.body?.trim() || "No comment text."
      const bodyLines = wrapText(body, Math.max(1, width - 3)).map((line) => `${continuation} ${line}`)
      return [`${branch} @${comment.user.login} · ${formatDate(comment.created_at)}`, ...bodyLines]
    })
  }
}
