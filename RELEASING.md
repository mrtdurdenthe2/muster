# Releasing muster

The npm release consists of `@kaiwlsn/muster`, a small Node.js launcher, and four optional native packages:

- `@kaiwlsn/muster-darwin-arm64`
- `@kaiwlsn/muster-darwin-x64`
- `@kaiwlsn/muster-linux-arm64`
- `@kaiwlsn/muster-linux-x64`

## One-time npm setup

1. Create or verify the `@kaiwlsn` npm organization or user scope.
2. For the first release, add a read/write granular npm token with package creation permission and **Bypass two-factor authentication** enabled as the `NPM_TOKEN` secret in the GitHub `npm` environment.
3. Ensure the GitHub `npm` environment permits the release workflow to publish all five packages.
4. After the first release, configure npm trusted publishing for all five packages and this repository's `publish.yml` workflow. The token can then be removed; an unset `NPM_TOKEN` leaves npm CLI free to use GitHub OIDC.

## Publish a version

1. Update the version in `package.json` and `package-lock.json`.
2. Run `bun run typecheck`, `bun run test`, and `bun run package:smoke`.
3. Commit and push the version change.
4. Create and publish a GitHub release tagged `v<version>`.

Publishing the GitHub release builds each binary on its native runner, publishes the platform packages, and then publishes the launcher package.
