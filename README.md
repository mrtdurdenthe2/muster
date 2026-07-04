# muster

TUI for managing your issues across the land of GitHub.

![muster screenshot](./showcase.png)

## GitHub Access

muster uses the GitHub CLI for authentication so it does not manage or store GitHub tokens directly.

Requirements:

- Install `gh` from https://cli.github.com/.
- Authenticate with `gh auth login --hostname github.com --web --scopes repo,read:org`.

Launch the issue list with:

```sh
bun run start
```

## Local Reference Repositories

This project vendors external source repositories under `repos/` using squashed git subtrees so coding agents can inspect real implementation and usage patterns locally.

- `repos/effect`: Effect source and tests.
- `repos/opentui`: OpenTUI source, docs, and examples.

These directories are reference material. Application code should depend on published packages, not import from `repos/`.

## Updating References

```sh
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
git subtree pull --prefix=repos/opentui https://github.com/anomalyco/opentui.git main --squash
```
