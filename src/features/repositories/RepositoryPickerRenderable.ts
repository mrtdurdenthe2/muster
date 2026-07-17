import {
  OptimizedBuffer,
  parseColor,
  Renderable,
  type CliRenderer,
  type KeyEvent,
  type RenderableOptions,
} from "@opentui/core"
import type { GitHubRepository } from "../../services/GitHubIssues.js"
import { theme } from "../../ui/theme.js"
import { truncate } from "../../ui/text.js"
import { normalizeOwnedRepositories } from "./model.js"

type RepositoryPickerMode = "select" | "third-party"

interface RepositoryPickerOption {
  readonly kind: "third-party" | "separator" | "repository"
  readonly name: string
  readonly repository?: string
}

export class RepositoryPickerRenderable extends Renderable {
  protected _focusable = true

  private repositories: ReadonlyArray<GitHubRepository> = []
  private selectedIndex = 0
  private scrollOffset = 0
  private mode: RepositoryPickerMode = "select"
  private repositoryInput = ""
  private title = "Make Issue in Other Repo"
  private message = ""
  private loading = false
  private spinnerFrame = 0
  private spinnerTimer: ReturnType<typeof setInterval> | null = null
  private readonly backgroundColor = parseColor(theme.background)
  private readonly panelColor = parseColor(theme.surface)
  private readonly titleColor = parseColor(theme.text)
  private readonly textColor = parseColor(theme.text)
  private readonly mutedColor = parseColor(theme.textMuted)
  private readonly activeColor = parseColor(theme.blue)
  private readonly errorColor = parseColor(theme.error)
  private readonly onSelect: (repository: string) => void
  private readonly onCancel: () => void

  constructor(
    ctx: CliRenderer,
    options: RenderableOptions<RepositoryPickerRenderable> & {
      onSelect: (repository: string) => void
      onCancel: () => void
    },
  ) {
    super(ctx, { ...options, buffered: true, visible: false })
    this.onSelect = options.onSelect
    this.onCancel = options.onCancel
  }

  public openLoading(title = "Make Issue in Other Repo"): void {
    this.repositories = []
    this.selectedIndex = 0
    this.scrollOffset = 0
    this.mode = "select"
    this.repositoryInput = ""
    this.title = title
    this.message = "Loading owned repositories..."
    this.loading = true
    this.visible = true
    this.startSpinner()
    this.focus()
    this.requestRender()
  }

  public openWithRepositories(
    repositories: ReadonlyArray<GitHubRepository>,
    message = "",
    title = "Make Issue in Other Repo",
  ): void {
    this.mode = "select"
    this.repositoryInput = ""
    this.title = title
    this.visible = true
    this.focus()
    this.setRepositories(repositories, message)
  }

  public close(): void {
    this.visible = false
    this.stopSpinner()
    this.requestRender()
  }

  public setRepositories(repositories: ReadonlyArray<GitHubRepository>, message?: string): void {
    this.repositories = normalizeOwnedRepositories(repositories)
    this.selectedIndex = this.repositories.length > 0 ? 2 : 0
    this.scrollOffset = 0
    this.loading = false
    this.stopSpinner()
    this.message = message ?? (this.repositories.length === 0 ? "No owned repositories found." : "")
    this.requestRender()
  }

  public setMessage(message: string): void {
    this.loading = false
    this.stopSpinner()
    this.message = message
    this.requestRender()
  }

  public handleKeyPress(key: KeyEvent): boolean {
    if (!this.visible) return false

    if (key.name === "escape") {
      if (this.mode === "third-party") {
        this.mode = "select"
        this.message = ""
        this.requestRender()
        return true
      }

      this.close()
      this.onCancel()
      return true
    }

    if (this.mode === "third-party") return this.handleRepositoryInputKeyPress(key)
    if (this.loading) return true

    if (key.name === "up" || key.name === "k") {
      this.moveSelection(-1)
      return true
    }

    if (key.name === "down" || key.name === "j") {
      this.moveSelection(1)
      return true
    }

    if (key.name === "return" || key.name === "linefeed") {
      this.chooseSelectedOption()
      return true
    }

    return true
  }

  protected renderSelf(buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.frameBuffer.clear(this.panelColor)
      this.frameBuffer.drawText(truncate(` ${this.title} `, this.width - 4), 2, 1, this.titleColor)

      if (this.loading) {
        this.drawLoadingSpinner()
        return
      }

      if (this.mode === "third-party") {
        this.drawRepositoryInput()
        return
      }

      const help = "Enter choose - Esc cancel"
      this.frameBuffer.drawText(help, 2, this.height - 3, this.mutedColor)
      if (this.message) {
        const color = this.message.startsWith("Unable") ? this.errorColor : this.mutedColor
        this.frameBuffer.drawText(truncate(this.message, this.width - 4), 2, this.height - 2, color)
      }

      const options = this.repositoryOptions()
      const listTop = 3
      const listHeight = Math.max(0, this.height - 7)
      this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, options.length - 1))
      this.updateScrollOffset(listHeight)

      options.slice(this.scrollOffset, this.scrollOffset + listHeight).forEach((option, index) => {
        const optionIndex = this.scrollOffset + index
        if (option.kind === "separator") return

        const selected = optionIndex === this.selectedIndex
        const y = listTop + index
        if (selected) this.frameBuffer?.fillRect(2, y, this.width - 4, 1, this.activeColor)
        this.frameBuffer?.drawText(
          truncate(`${selected ? ">" : " "} ${option.name}`, this.width - 6),
          3,
          y,
          selected ? parseColor("#ffffff") : this.textColor,
        )
      })
    }
  }

  private handleRepositoryInputKeyPress(key: KeyEvent): boolean {
    if (key.name === "return" || key.name === "linefeed") {
      const repository = this.repositoryInput.trim()
      if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
        this.message = "Use the format owner/name."
        this.requestRender()
        return true
      }

      this.onSelect(repository)
      return true
    }

    if (key.name === "backspace") {
      this.repositoryInput = this.repositoryInput.slice(0, -1)
      this.message = ""
      this.requestRender()
      return true
    }

    if (key.name === "space") return true

    if (!key.ctrl && !key.meta && key.raw.length > 0 && !key.raw.includes("\x1b")) {
      this.repositoryInput += key.raw.replace(/[\r\n\s]/g, "")
      this.message = ""
      this.requestRender()
      return true
    }

    return true
  }

  private chooseSelectedOption(): void {
    const option = this.repositoryOptions()[this.selectedIndex]
    if (!option || option.kind === "separator") return

    if (option.kind === "third-party") {
      this.mode = "third-party"
      this.repositoryInput = ""
      this.message = ""
      this.requestRender()
      return
    }

    if (option.repository) this.onSelect(option.repository)
  }

  private moveSelection(delta: number): void {
    const options = this.repositoryOptions()
    if (options.length === 0) return

    const direction = Math.sign(delta)
    let nextIndex = this.selectedIndex + direction
    while (nextIndex >= 0 && nextIndex < options.length && options[nextIndex]?.kind === "separator") {
      nextIndex += direction
    }

    if (nextIndex < 0 || nextIndex >= options.length) return

    this.selectedIndex = nextIndex
    this.requestRender()
  }

  private repositoryOptions(): ReadonlyArray<RepositoryPickerOption> {
    return [
      { kind: "third-party", name: "Third-party repository..." },
      { kind: "separator", name: "" },
      ...this.repositories.map((repository) => ({
        kind: "repository" as const,
        name: `${repository.full_name}${repository.private ? " (private)" : ""}`,
        repository: repository.full_name,
      })),
    ]
  }

  private updateScrollOffset(listHeight: number): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex
    } else if (this.selectedIndex >= this.scrollOffset + listHeight) {
      this.scrollOffset = this.selectedIndex - listHeight + 1
    }
  }

  private startSpinner(): void {
    this.stopSpinner()
    this.spinnerFrame = 0
    this.spinnerTimer = setInterval(() => {
      if (!this.visible || !this.loading) {
        this.stopSpinner()
        return
      }

      this.spinnerFrame = (this.spinnerFrame + 1) % 10
      this.requestRender()
    }, 120)
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer)
      this.spinnerTimer = null
    }
  }

  private drawLoadingSpinner(): void {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    const text = `${frames[this.spinnerFrame]} Loading repositories...`
    const x = Math.max(2, Math.floor((this.width - text.length) / 2))
    const y = Math.max(2, Math.floor(this.height / 2))
    this.frameBuffer?.drawText(text, x, y, this.titleColor)
  }

  private drawRepositoryInput(): void {
    this.frameBuffer?.fillRect(2, 3, this.width - 4, 1, this.backgroundColor)
    const input = this.repositoryInput ? `${this.repositoryInput}_` : "Owner/Repo"
    this.frameBuffer?.drawText(
      truncate(input, this.width - 6),
      3,
      3,
      this.repositoryInput ? this.textColor : this.mutedColor,
    )
    this.frameBuffer?.drawText("Enter owner/name - Esc back", 2, this.height - 3, this.mutedColor)
    if (this.message) {
      const color = this.message.startsWith("Use") ? this.errorColor : this.mutedColor
      this.frameBuffer?.drawText(truncate(this.message, this.width - 4), 2, this.height - 2, color)
    }
  }
}
