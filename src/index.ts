import { Effect, Layer, Match, ParseResult } from "effect"
import { CommandError, JsonParseError } from "./services/CommandRunner.js"
import { GitHubCli, GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "./services/GitHubCli.js"
import { GitHubIssues, GitHubIssuesLive } from "./services/GitHubIssues.js"

const renderAuthHelp = (error: GitHubCliUnavailable | GitHubCliUnauthenticated): string =>
  Match.value(error).pipe(
    Match.tag("GitHubCliUnavailable", () => "GitHub CLI is required. Install it from https://cli.github.com/ and run `gh auth login`."),
    Match.tag("GitHubCliUnauthenticated", () => "GitHub CLI is not authenticated. Run `gh auth login --hostname github.com --web --scopes repo,read:org`."),
    Match.exhaustive,
  )

const program = Effect.gen(function* () {
  const github = yield* GitHubCli
  const issues = yield* GitHubIssues
  const user = yield* github.currentUser
  const assigned = yield* issues.listAssigned({ limit: 20 })

  console.log(`Signed in to GitHub as ${user.login}`)
  console.log(`Open assigned issues: ${assigned.length}`)

  for (const issue of assigned.slice(0, 10)) {
    const repository = issues.repositoryNameFromApiUrl(issue.repository_url)
    console.log(`#${issue.number} ${repository} ${issue.title}`)
  }
})

Effect.runPromise(
  program.pipe(
    Effect.provide(Layer.merge(GitHubCliLive, GitHubIssuesLive)),
    Effect.catchTags({
      GitHubCliUnavailable: (error) => Effect.sync(() => console.error(renderAuthHelp(error))),
      GitHubCliUnauthenticated: (error) => Effect.sync(() => console.error(renderAuthHelp(error))),
      CommandError: (error: CommandError) => Effect.sync(() => console.error(error.detail)),
      JsonParseError: (_error: JsonParseError) => Effect.sync(() => console.error("GitHub CLI returned invalid JSON.")),
      ParseError: (error: ParseResult.ParseError) => Effect.sync(() => console.error(error.message)),
    }),
  ),
)
