import { Layer, Match, ParseResult } from "effect"
import { CommandError, JsonParseError } from "../services/CommandRunner.js"
import { GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "../services/GitHubCli.js"
import { GitHubIssuesLive } from "../services/GitHubIssues.js"

export const appLayer = Layer.merge(GitHubCliLive, GitHubIssuesLive)

const renderAuthHelp = (error: GitHubCliUnavailable | GitHubCliUnauthenticated): string =>
  Match.value(error).pipe(
    Match.tag(
      "GitHubCliUnavailable",
      () => "GitHub CLI is required. Install it from https://cli.github.com/ and run `gh auth login`.",
    ),
    Match.tag(
      "GitHubCliUnauthenticated",
      () => "GitHub CLI is not authenticated. Run `gh auth login --hostname github.com --web --scopes repo,read:org`.",
    ),
    Match.exhaustive,
  )

export const errorText = (
  error: GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError,
): string =>
  Match.value(error).pipe(
    Match.tag("GitHubCliUnavailable", renderAuthHelp),
    Match.tag("GitHubCliUnauthenticated", renderAuthHelp),
    Match.tag("CommandError", (commandError) => commandError.detail),
    Match.tag("JsonParseError", () => "GitHub CLI returned invalid JSON."),
    Match.tag("ParseError", (parseError) => parseError.message),
    Match.exhaustive,
  )
