# Agent Instructions

This project is for building a TypeScript terminal UI with OpenTUI and Effect.

## Vendored Repositories

External source repositories are vendored under `repos/` as git subtrees:

- `repos/effect` contains the Effect monorepo.
- `repos/opentui` contains the OpenTUI monorepo.

If you are unsure on how to use an effect method, please look through the effect codebase to see how it works and examples on how to use it.
Use vendored repositories as read-only reference material when working with related libraries.

- Prefer examples and patterns from vendored source over guesses or web search.
- Do not edit files under `repos/` unless explicitly asked.
- Do not import from `repos/`; application code should import normal package dependencies.
- Do not treat `repos/` as application code when searching for project implementation files.

When writing Effect code, inspect `repos/effect/packages/effect` for idiomatic API usage, tests, module structure, and error-handling patterns.

When writing OpenTUI code, inspect `repos/opentui/packages/core`, `repos/opentui/packages/examples`, and `repos/opentui/AGENTS.md` for component, renderer, input, layout, and terminal-debugging patterns.

## Project Direction

- Use TypeScript for application code.
- Prefer Bun commands for OpenTUI-related development unless the project later standardizes on another runtime.
- Keep Effect orchestration separate from OpenTUI rendering concerns where practical.
- Treat terminal UI runtime behavior carefully: console output may interfere with the TUI, so prefer tests or explicit debug sinks over ad-hoc `console.log` while the app is running.

## Subtree Maintenance

Update the vendored references with:

```sh
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
git subtree pull --prefix=repos/opentui https://github.com/anomalyco/opentui.git main --squash
```
