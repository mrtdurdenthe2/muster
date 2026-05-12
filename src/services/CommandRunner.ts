import { Context, Effect, Layer, ParseResult, Schema } from "effect"
import { errorMessage } from "../errors.js"

export interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface RunOptions {
  readonly stdin?: string
}

export class CommandError extends Schema.TaggedError<CommandError>()("CommandError", {
  command: Schema.String,
  args: Schema.Array(Schema.String),
  detail: Schema.String,
  cause: Schema.Unknown,
}) {}

export class JsonParseError extends Schema.TaggedError<JsonParseError>()("JsonParseError", {
  command: Schema.String,
  args: Schema.Array(Schema.String),
  stdout: Schema.String,
  cause: Schema.Unknown,
}) {}

const readStream = async (stream: ReadableStream | null | undefined): Promise<string> => {
  if (!stream) return ""
  return Bun.readableStreamToText(stream)
}

export interface CommandRunner {
  readonly run: (command: string, args: readonly string[], options?: RunOptions) => Effect.Effect<CommandResult, CommandError>
  readonly runJson: <A>(command: string, args: readonly string[]) => Effect.Effect<A, CommandError | JsonParseError>
  readonly runSchema: <S extends Schema.Schema.Any>(
    schema: S,
    command: string,
    args: readonly string[],
  ) => Effect.Effect<Schema.Schema.Type<S>, CommandError | JsonParseError | ParseResult.ParseError, Schema.Schema.Context<S>>
}

export const CommandRunner = Context.GenericTag<CommandRunner>("muster/CommandRunner")

export const CommandRunnerLive = Layer.effect(
  CommandRunner,
  Effect.gen(function* () {
    const runRaw = (command: string, args: readonly string[], stdin: string | undefined) =>
      Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn({
            cmd: [command, ...args],
            stdin: stdin === undefined ? "ignore" : "pipe",
            stdout: "pipe",
            stderr: "pipe",
          })

          if (stdin !== undefined && proc.stdin) {
            proc.stdin.write(stdin)
            proc.stdin.end()
          }

          const [exitCode, stdout, stderr] = await Promise.all([
            proc.exited,
            readStream(proc.stdout),
            readStream(proc.stderr),
          ])

          return { stdout, stderr, exitCode }
        },
        catch: (cause) =>
          new CommandError({
            command,
            args: [...args],
            detail: errorMessage(cause) || `Failed to run ${command}`,
            cause,
          }),
      })

    const run = (command: string, args: readonly string[], options?: RunOptions) =>
      runRaw(command, args, options?.stdin).pipe(
        Effect.flatMap((result) => {
          if (result.exitCode === 0) return Effect.succeed(result)

          const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`
          return Effect.fail(
            new CommandError({
              command,
              args: [...args],
              detail,
              cause: detail,
            }),
          )
        }),
      )

    const runJson = <A>(command: string, args: readonly string[]) =>
      run(command, args).pipe(
        Effect.flatMap((result) =>
          Effect.try({
            try: () => JSON.parse(result.stdout) as A,
            catch: (cause) => new JsonParseError({ command, args: [...args], stdout: result.stdout, cause }),
          }),
        ),
      )

    const runSchema = <S extends Schema.Schema.Any>(schema: S, command: string, args: readonly string[]) => {
      const decode = Schema.decodeUnknown(schema) as (
        input: unknown,
      ) => Effect.Effect<Schema.Schema.Type<S>, ParseResult.ParseError, Schema.Schema.Context<S>>
      return runJson<unknown>(command, args).pipe(Effect.flatMap(decode))
    }

    return {
      run,
      runJson,
      runSchema,
    } as const
  }),
)
