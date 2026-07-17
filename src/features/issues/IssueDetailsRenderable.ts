import {
  BoxRenderable,
  MarkdownRenderable,
  OptimizedBuffer,
  parseColor,
  Renderable,
  ScrollBoxRenderable,
  TextRenderable,
  type BorderCharacters,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
} from "@opentui/core"
import type { GitHubIssueComment } from "../../services/GitHubIssues.js"
import { issueSyntaxStyle } from "../../ui/syntax.js"
import { labelBackgroundColor, labelTextColor, theme } from "../../ui/theme.js"
import { formatDate, truncate } from "../../ui/text.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"

type CommentState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Loaded"; readonly comments: ReadonlyArray<GitHubIssueComment> }
  | { readonly _tag: "Error"; readonly message: string }

const commentBorder: BorderCharacters = {
  topLeft: "",
  topRight: "",
  bottomLeft: "",
  bottomRight: "",
  horizontal: " ",
  vertical: "┃",
  topT: "",
  bottomT: "",
  leftT: "",
  rightT: "",
  cross: "",
}

export class IssueDetailsRenderable extends Renderable {
  private option: IssueOption | null = null
  private optionKey: string | null = null
  private commentState: CommentState = { _tag: "Idle" }
  private message = "Select an issue to see details."
  private expanded = false
  private contentVersion = 0
  private commentsVersion = 0
  private commentsContainer: BoxRenderable | null = null
  private readonly renderer: CliRenderer
  private readonly scrollBox: ScrollBoxRenderable
  private readonly backgroundColor = parseColor(theme.background)
  private readonly barColor = parseColor(theme.surface)
  private readonly panelColor = parseColor(theme.background)
  private readonly borderColor = parseColor(theme.background)
  private readonly titleColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textMuted)

  constructor(ctx: CliRenderer, options: RenderableOptions<IssueDetailsRenderable>) {
    super(ctx, { ...options, buffered: true })
    this.renderer = ctx
    this.scrollBox = new ScrollBoxRenderable(ctx, {
      id: `${this.id}-scroll`,
      position: "absolute",
      left: 0,
      top: 4,
      width: "100%",
      height: Math.max(1, this.height - 4),
      backgroundColor: theme.background,
      scrollY: true,
      scrollX: false,
      paddingLeft: 2,
      paddingRight: 2,
      verticalScrollbarOptions: {
        trackOptions: {
          backgroundColor: theme.background,
          foregroundColor: theme.border,
        },
      },
      visible: false,
    })
    this.add(this.scrollBox)
  }

  public setOption(option: IssueOption | null): void {
    const nextKey = option ? issueOptionKey(option) : null
    const changed = nextKey !== this.optionKey
    if (changed) this.commentState = { _tag: "Idle" }

    this.option = option
    this.optionKey = nextKey
    this.message = option ? "" : "No issue selected."
    this.rebuildContent()
    if (changed) this.scrollBox.scrollTop = 0
    if (this.expanded && option) this.focusContent()
    this.requestRender()
  }

  public setMessage(message: string): void {
    this.option = null
    this.optionKey = null
    this.commentState = { _tag: "Idle" }
    this.message = message
    this.rebuildContent()
    this.scrollBox.scrollTop = 0
    this.requestRender()
  }

  public setExpanded(expanded: boolean): void {
    this.expanded = expanded
    if (expanded) this.focusContent()
    this.requestRender()
  }

  public focusContent(): void {
    if (this.option) this.scrollBox.focus()
  }

  public handleKeyPress(key: KeyEvent): boolean {
    return this.scrollBox.handleKeyPress(key)
  }

  public setCommentsLoading(key: string): void {
    if (key !== this.optionKey) return
    const alreadyLoading = this.commentState._tag === "Idle" || this.commentState._tag === "Loading"
    this.commentState = { _tag: "Loading" }
    if (!alreadyLoading) this.rebuildComments()
    this.requestRender()
  }

  public setComments(key: string, comments: ReadonlyArray<GitHubIssueComment>): void {
    if (key !== this.optionKey) return
    this.commentState = { _tag: "Loaded", comments }
    this.rebuildComments()
    this.requestRender()
  }

  public setCommentsError(key: string, message: string): void {
    if (key !== this.optionKey) return
    this.commentState = { _tag: "Error", message }
    this.rebuildComments()
    this.requestRender()
  }

  protected renderSelf(_buffer: OptimizedBuffer, _deltaTime: number): void {
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

      const hint = this.expanded ? "j/k or arrows scroll · Esc collapse" : "Enter expand"
      this.frameBuffer.drawText(truncate(hint, Math.max(0, this.width - 2)), 1, 2, this.mutedColor)
    }
  }

  protected onResize(width: number, height: number): void {
    super.onResize(width, height)
    this.scrollBox.width = width
    this.scrollBox.height = Math.max(1, height - 4)
  }

  private rebuildContent(): void {
    const previousScrollTop = this.scrollBox.scrollTop
    this.commentsContainer = null
    for (const child of this.scrollBox.getChildren()) child.destroyRecursively()
    this.contentVersion++
    this.scrollBox.visible = this.option !== null
    if (!this.option) return

    const value = this.option.value
    const prefix = `${this.id}-content-${this.contentVersion}`

    this.scrollBox.add(
      new TextRenderable(this.renderer, {
        id: `${prefix}-metadata`,
        content: `Author: ${value.issue.user.login}\nState: ${value.issue.state}\nUpdated: ${formatDate(value.issue.updated_at)}`,
        width: "100%",
        height: 3,
        flexShrink: 0,
        fg: theme.textMuted,
      }),
    )
    this.scrollBox.add(
      new TextRenderable(this.renderer, {
        id: `${prefix}-url`,
        content: value.issue.html_url,
        width: "100%",
        height: 1,
        flexShrink: 0,
        marginBottom: 1,
        fg: theme.blueText,
      }),
    )
    this.scrollBox.add(
      new MarkdownRenderable(this.renderer, {
        id: `${prefix}-body`,
        content: value.issue.body?.trim() || "No description provided.",
        syntaxStyle: issueSyntaxStyle,
        fg: theme.text,
        bg: theme.background,
        conceal: true,
        concealCode: false,
        internalBlockMode: "top-level",
        width: "100%",
        flexShrink: 0,
        marginBottom: 1,
      }),
    )
    this.scrollBox.add(
      new TextRenderable(this.renderer, {
        id: `${prefix}-comments-title`,
        content: "Comments",
        width: "100%",
        height: 1,
        flexShrink: 0,
        marginTop: 1,
        fg: theme.textMuted,
      }),
    )

    this.commentsContainer = new BoxRenderable(this.renderer, {
      id: `${prefix}-comments`,
      width: "100%",
      flexDirection: "column",
      flexShrink: 0,
      backgroundColor: theme.background,
    })
    this.scrollBox.add(this.commentsContainer)
    this.addComments(`${prefix}-comments-${++this.commentsVersion}`, this.commentsContainer)
    this.scrollBox.scrollTop = previousScrollTop
  }

  private rebuildComments(): void {
    if (!this.commentsContainer) return

    const previousScrollTop = this.scrollBox.scrollTop
    for (const child of this.commentsContainer.getChildren()) child.destroyRecursively()
    this.addComments(
      `${this.id}-comments-${this.contentVersion}-${++this.commentsVersion}`,
      this.commentsContainer,
    )
    this.scrollBox.scrollTop = previousScrollTop
  }

  private addComments(prefix: string, target: BoxRenderable): void {
    if (this.commentState._tag === "Idle" || this.commentState._tag === "Loading") {
      this.addCommentStatus(target, `${prefix}-loading`, "Loading comments...")
      return
    }
    if (this.commentState._tag === "Error") {
      this.addCommentStatus(target, `${prefix}-error`, `Unable to load comments: ${this.commentState.message}`)
      return
    }
    if (this.commentState.comments.length === 0) {
      this.addCommentStatus(target, `${prefix}-empty`, "No comments")
      return
    }

    this.commentState.comments.forEach((comment, index) => {
      const commentBox = new BoxRenderable(this.renderer, {
        id: `${prefix}-comment-${comment.id}`,
        width: "100%",
        flexDirection: "column",
        flexShrink: 0,
        border: ["left"],
        customBorderChars: commentBorder,
        borderColor: theme.border,
        paddingLeft: 1,
        marginTop: index === 0 ? 0 : 1,
        backgroundColor: theme.background,
      })
      commentBox.add(
        new TextRenderable(this.renderer, {
          id: `${prefix}-comment-${comment.id}-author`,
          content: `@${comment.user.login} · ${formatDate(comment.created_at)}`,
          width: "100%",
          height: 1,
          flexShrink: 0,
          fg: theme.textSubtle,
        }),
      )
      commentBox.add(
        new MarkdownRenderable(this.renderer, {
          id: `${prefix}-comment-${comment.id}-body`,
          content: comment.body?.trim() || "No comment text.",
          syntaxStyle: issueSyntaxStyle,
          fg: theme.text,
          bg: theme.background,
          conceal: true,
          concealCode: false,
          internalBlockMode: "top-level",
          width: "100%",
          flexShrink: 0,
        }),
      )
      target.add(commentBox)
    })
  }

  private addCommentStatus(target: BoxRenderable, id: string, content: string): void {
    target.add(
      new TextRenderable(this.renderer, {
        id,
        content: `┃ ${content}`,
        width: "100%",
        height: 1,
        flexShrink: 0,
        fg: theme.textSubtle,
      }),
    )
  }
}
