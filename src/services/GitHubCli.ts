import { Context, Effect, Layer, ParseResult, Schema } from "effect"
import { CommandError, CommandRunner, CommandRunnerLive, JsonParseError } from "./CommandRunner.js"

export const GitHubUser = Schema.Struct({
  login: Schema.String,
})

export type GitHubUser = typeof GitHubUser.Type

export class GitHubCliUnavailable extends Schema.TaggedError<GitHubCliUnavailable>()("GitHubCliUnavailable", {
  detail: Schema.String,
}) {}

export class GitHubCliUnauthenticated extends Schema.TaggedError<GitHubCliUnauthenticated>()("GitHubCliUnauthenticated", {
  detail: Schema.String,
}) {}

export interface GitHubCli {
  readonly ensureInstalled: Effect.Effect<void, GitHubCliUnavailable>
  readonly ensureAuthenticated: Effect.Effect<void, GitHubCliUnavailable | GitHubCliUnauthenticated>
  readonly login: Effect.Effect<void, CommandError>
  readonly currentUser: Effect.Effect<GitHubUser, GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError>
  readonly apiJson: <S extends Schema.Schema.Any>(
    operation: string,
    schema: S,
    args: readonly string[],
  ) => Effect.Effect<Schema.Schema.Type<S>, GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError, Schema.Schema.Context<S>>
}

export const GitHubCli = Context.GenericTag<GitHubCli>("muster/GitHubCli")

export const GitHubCliLive = Layer.effect(
  GitHubCli,
  Effect.gen(function* () {
    const commands = yield* CommandRunner

    const ensureInstalled = commands.run("gh", ["--version"]).pipe(
      Effect.asVoid,
      Effect.mapError(
        (error) =>
          new GitHubCliUnavailable({
            detail: error.detail || "GitHub CLI is not installed or not available on PATH.",
          }),
      ),
    )

    const ensureAuthenticated = ensureInstalled.pipe(
      Effect.flatMap(() =>
        commands.run("gh", ["auth", "status", "--hostname", "github.com"]).pipe(
          Effect.asVoid,
          Effect.mapError(
            () =>
              new GitHubCliUnauthenticated({
                detail: "GitHub CLI is installed, but not authenticated for github.com.",
              }),
          ),
        ),
      ),
    )

    const login = commands.run("gh", ["auth", "login", "--hostname", "github.com", "--web", "--scopes", "repo,read:org"]).pipe(
      Effect.asVoid,
    )

    const currentUser = ensureAuthenticated.pipe(
      Effect.flatMap(() => commands.runSchema(GitHubUser, "gh", ["api", "user"])),
    )

    const apiJson = <S extends Schema.Schema.Any>(operation: string, schema: S, args: readonly string[]) =>
      ensureAuthenticated.pipe(
        Effect.flatMap(() => commands.runSchema(schema, "gh", ["api", ...args])),
        Effect.withSpan(`GitHubCli.${operation}`),
      )

    return {
      ensureInstalled,
      ensureAuthenticated,
      login,
      currentUser,
      apiJson,
    } as const
  }),
).pipe(Layer.provide(CommandRunnerLive))

export type GitHubCliError =
  | GitHubCliUnavailable
  | GitHubCliUnauthenticated
  | CommandError
  | JsonParseError
  | ParseResult.ParseError
