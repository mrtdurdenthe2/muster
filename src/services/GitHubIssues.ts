import { Context, Effect, Layer, ParseResult, Schema } from "effect"
import type { CommandError, JsonParseError } from "./CommandRunner.js"
import { GitHubCli, GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "./GitHubCli.js"

export const GitHubIssue = Schema.Struct({
  html_url: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  state: Schema.String,
  repository_url: Schema.String,
  updated_at: Schema.String,
  labels: Schema.Array(
    Schema.Struct({
      name: Schema.String,
    }),
  ),
  user: Schema.Struct({
    login: Schema.String,
  }),
})

export type GitHubIssue = typeof GitHubIssue.Type

export const IssueSearchResponse = Schema.Struct({
  total_count: Schema.Number,
  incomplete_results: Schema.Boolean,
  items: Schema.Array(GitHubIssue),
})

export type IssueSearchResponse = typeof IssueSearchResponse.Type

export interface IssueSearchOptions {
  readonly query?: string
  readonly limit?: number
}

const repositoryNameFromApiUrl = (url: string): string => url.replace(/^https:\/\/api\.github\.com\/repos\//, "")

export interface GitHubIssues {
  readonly searchAssigned: (options?: IssueSearchOptions) => Effect.Effect<
    IssueSearchResponse,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly listAssigned: (options?: IssueSearchOptions) => Effect.Effect<
    ReadonlyArray<GitHubIssue>,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly repositoryNameFromApiUrl: (url: string) => string
}

export const GitHubIssues = Context.GenericTag<GitHubIssues>("muster/GitHubIssues")

export const GitHubIssuesLive = Layer.effect(
  GitHubIssues,
  Effect.gen(function* () {
    const github = yield* GitHubCli

    const searchAssigned = ({ query = "involves:@me is:issue is:open archived:false", limit = 50 }: IssueSearchOptions = {}) =>
      github.apiJson("searchAssignedIssues", IssueSearchResponse, ["--method", "GET", "search/issues", "-f", `q=${query}`, "-F", `per_page=${limit}`])

    const listAssigned = (options?: IssueSearchOptions) => searchAssigned(options).pipe(Effect.map((response) => response.items))

    return {
      searchAssigned,
      listAssigned,
      repositoryNameFromApiUrl,
    } as const
  }),
).pipe(Layer.provide(GitHubCliLive))
