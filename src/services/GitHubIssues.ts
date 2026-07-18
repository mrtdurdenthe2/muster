import { Context, Effect, Layer, ParseResult, Schema } from "effect"
import type { CommandError, JsonParseError } from "./CommandRunner.js"
import { GitHubCli, GitHubCliLive, GitHubCliUnauthenticated, GitHubCliUnavailable } from "./GitHubCli.js"

export const GitHubIssue = Schema.Struct({
  html_url: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  state: Schema.Literal("open", "closed"),
  repository_url: Schema.String,
  updated_at: Schema.String,
  labels: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      color: Schema.optionalWith(Schema.String, { default: () => "" }),
    }),
  ),
  body: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), { default: () => null }),
  pull_request: Schema.optional(Schema.Unknown),
  user: Schema.Struct({
    login: Schema.String,
  }),
})

export type GitHubIssue = typeof GitHubIssue.Type
export type GitHubIssueState = GitHubIssue["state"]

export const GitHubIssueComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), { default: () => null }),
  created_at: Schema.String,
  user: Schema.Struct({
    login: Schema.String,
  }),
})

export type GitHubIssueComment = typeof GitHubIssueComment.Type

const GitHubIssueCommentPages = Schema.Array(Schema.Array(GitHubIssueComment))

export const GitHubLabel = Schema.Struct({
  name: Schema.String,
  color: Schema.optionalWith(Schema.String, { default: () => "" }),
})

export type GitHubLabel = typeof GitHubLabel.Type

export const GitHubRepository = Schema.Struct({
  full_name: Schema.String,
  private: Schema.Boolean,
  archived: Schema.Boolean,
  updated_at: Schema.String,
  description: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), { default: () => null }),
})

export type GitHubRepository = typeof GitHubRepository.Type

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

export interface IssueCreateOptions {
  readonly repository: string
  readonly title: string
  readonly body: string
  readonly labels?: ReadonlyArray<string>
}

export interface IssueCreateResult {
  readonly url: string
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
  readonly getRepository: (repository: string) => Effect.Effect<
    GitHubRepository,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly getIssue: (repository: string, issueNumber: number) => Effect.Effect<
    GitHubIssue,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly listLabels: (repository: string) => Effect.Effect<
    ReadonlyArray<GitHubLabel>,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly listComments: (repository: string, issueNumber: number) => Effect.Effect<
    ReadonlyArray<GitHubIssueComment>,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly createComment: (repository: string, issueNumber: number, body: string) => Effect.Effect<
    GitHubIssueComment,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly setState: (repository: string, issueNumber: number, state: GitHubIssueState) => Effect.Effect<
    GitHubIssue,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly listOwnedRepositories: () => Effect.Effect<
    ReadonlyArray<GitHubRepository>,
    GitHubCliUnavailable | GitHubCliUnauthenticated | CommandError | JsonParseError | ParseResult.ParseError
  >
  readonly create: (options: IssueCreateOptions) => Effect.Effect<
    IssueCreateResult,
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

    const getRepository = (repository: string) =>
      github.apiJson("getRepository", GitHubRepository, ["--method", "GET", `repos/${repository}`])

    const getIssue = (repository: string, issueNumber: number) =>
      github.apiJson("getIssue", GitHubIssue, ["--method", "GET", `repos/${repository}/issues/${issueNumber}`])

    const listLabels = (repository: string) =>
      github.apiJson("listRepositoryLabels", Schema.Array(GitHubLabel), ["--method", "GET", `repos/${repository}/labels`, "-F", "per_page=100"])

    const listComments = (repository: string, issueNumber: number) =>
      github
        .apiJson("listIssueComments", GitHubIssueCommentPages, [
          "--paginate",
          "--slurp",
          "--method",
          "GET",
          `repos/${repository}/issues/${issueNumber}/comments`,
          "-F",
          "per_page=100",
        ])
        .pipe(Effect.map((pages) => pages.flat()))

    const createComment = (repository: string, issueNumber: number, body: string) =>
      github.apiJson("createIssueComment", GitHubIssueComment, [
        "--method",
        "POST",
        `repos/${repository}/issues/${issueNumber}/comments`,
        "-f",
        `body=${body}`,
      ])

    const setState = (repository: string, issueNumber: number, state: GitHubIssueState) =>
      github.apiJson("setIssueState", GitHubIssue, [
        "--method",
        "PATCH",
        `repos/${repository}/issues/${issueNumber}`,
        "-f",
        `state=${state}`,
      ])

    const listOwnedRepositories = () =>
      github.apiJson("listOwnedRepositories", Schema.Array(GitHubRepository), [
        "--method",
        "GET",
        "user/repos",
        "-f",
        "affiliation=owner",
        "-f",
        "sort=updated",
        "-F",
        "per_page=100",
      ])

    const createLabel = (repository: string, name: string) =>
      github.command("createLabel", ["label", "create", name, "--repo", repository, "--color", "ededed", "--description", "Created from muster"]).pipe(
        Effect.asVoid,
      )

    const ensureLabels = (repository: string, labels: ReadonlyArray<string>) =>
      labels.length === 0
        ? Effect.void
        : listLabels(repository).pipe(
            Effect.flatMap((existingLabels) => {
              const existing = new Set(existingLabels.map((label) => label.name.toLocaleLowerCase()))
              const missing = labels.filter((label) => !existing.has(label.toLocaleLowerCase()))
              return Effect.forEach(missing, (label) => createLabel(repository, label), { concurrency: 1 })
            }),
            Effect.asVoid,
          )

    const create = ({ repository, title, body, labels = [] }: IssueCreateOptions) =>
      ensureLabels(repository, labels).pipe(
        Effect.flatMap(() =>
          github.command("createIssue", [
            "issue",
            "create",
            "--repo",
            repository,
            "--title",
            title,
            "--body",
            body,
            ...labels.flatMap((label) => ["--label", label]),
          ]),
        ),
        Effect.map((result) => ({ url: result.stdout.trim() || `https://github.com/${repository}/issues` })),
      )

    return {
      searchAssigned,
      listAssigned,
      getRepository,
      getIssue,
      listLabels,
      listComments,
      createComment,
      setState,
      listOwnedRepositories,
      create,
      repositoryNameFromApiUrl,
    } as const
  }),
).pipe(Layer.provide(GitHubCliLive))
