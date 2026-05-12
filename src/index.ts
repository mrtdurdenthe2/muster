import {
  BoxRenderable,
  createCliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core"
import { Effect, Layer, Match, ParseResult } from "effect"
import { CommandError, JsonParseError } from "./services/CommandRunner.js"
import { GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "./services/GitHubCli.js"
import { GitHubIssues, GitHubIssuesLive, type GitHubIssue } from "./services/GitHubIssues.js"

interface IssueOptionValue {
  readonly issue: GitHubIssue
  readonly repository: string
}

const appLayer = Layer.merge(GitHubCliLive, GitHubIssuesLive)

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

const selectedIssueText = (option: SelectOption | null): string => {
  if (!option) return "No issue selected."
  const value = option.value as IssueOptionValue
  const labels = value.issue.labels.map((label) => label.name).join(", ") || "none"

  return [
    `${value.repository} #${value.issue.number}`,
    value.issue.title,
    "",
    `Author: ${value.issue.user.login}`,
    `State: ${value.issue.state}`,
    `Updated: ${formatDate(value.issue.updated_at)}`,
    `Labels: ${labels}`,
    "",
    value.issue.html_url,
  ].join("\n")
}

const loadIssues = Effect.gen(function* () {
  const issues = yield* GitHubIssues
  const response = yield* issues.searchAssigned({ limit: 50 })
  return {
    total: response.total_count,
    options: response.items.map((issue) => issueToOption(issue, issues)),
  }
})

const createShell = (renderer: CliRenderer) => {
  renderer.setBackgroundColor("#0d1117")

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
    height: Math.max(8, renderer.terminalHeight - 6),
    flexDirection: "row",
  })
  container.add(body)

  const issueList = new SelectRenderable(renderer, {
    id: "issue-list",
    width: Math.max(48, Math.floor(renderer.terminalWidth * 0.58)),
    height: Math.max(8, renderer.terminalHeight - 6),
    options: [],
    backgroundColor: "#161b22",
    focusedBackgroundColor: "#161b22",
    textColor: "#c9d1d9",
    focusedTextColor: "#f0f6fc",
    selectedBackgroundColor: "#1f6feb",
    selectedTextColor: "#ffffff",
    descriptionColor: "#8b949e",
    selectedDescriptionColor: "#dbeafe",
    showDescription: true,
    showScrollIndicator: true,
    wrapSelection: false,
    fastScrollStep: 5,
  })
  body.add(issueList)

  const details = new TextRenderable(renderer, {
    id: "details",
    content: "Select an issue to see details.",
    width: "auto",
    height: Math.max(8, renderer.terminalHeight - 6),
    fg: "#c9d1d9",
  })
  body.add(details)

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: "↑/↓ or j/k to move · enter to select · r to refresh · q to quit",
    height: 1,
    fg: "#8b949e",
  })
  container.add(footer)

  issueList.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: SelectOption) => {
    details.content = selectedIssueText(option)
  })
  issueList.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
    details.content = selectedIssueText(option)
  })

  issueList.focus()

  return { status, issueList, details }
}

const refreshIssues = (shell: ReturnType<typeof createShell>): void => {
  shell.status.content = "Loading issues from GitHub CLI…"
  shell.details.content = ""

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
      shell.details.content = result.message
      return
    }

    shell.issueList.options = result.result.options
    shell.status.content = `${result.result.options.length} shown · ${result.result.total} total matches`
    shell.details.content = selectedIssueText(shell.issueList.getSelectedOption())
  })
}

const main = async (): Promise<void> => {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const shell = createShell(renderer)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q") renderer.stop()
    if (key.name === "r") refreshIssues(shell)
  })

  refreshIssues(shell)
  renderer.start()
}

await main()
