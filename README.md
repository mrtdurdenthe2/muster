# muster

TUI for managing your issues across the land of GitHub.

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
