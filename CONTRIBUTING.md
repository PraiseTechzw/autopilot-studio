# Contributing to Autopilot Studio

Thank you for improving Autopilot Studio. Contributions must preserve the project’s local-first boundary: source contents, diffs, local file names, remote URLs, pairing codes, device private keys, and Git credentials must not be sent to Studio or committed to this repository.

## Development workflow

Use Node.js 20 or newer and pnpm. Run the following before opening a pull request:

```bash
pnpm install
pnpm test
pnpm check
node --check companion/autopilot.mjs
pnpm companion:package
pnpm companion:verify-release
```

Database changes must update `drizzle/schema.ts`, generate a migration, review the generated SQL, and apply the migration in the managed development environment. Avoid destructive schema changes unless they are explicitly reviewed.

## Pull requests

Keep changes narrow and explain the safety impact. Include tests for policy, authorization, signing, release, or device-lifecycle changes. Do not include generated `release/` artifacts, local Companion configuration, `.env` files, pairing codes, tokens, private keys, or Git credentials.

Git operations remain local by design. New automation must not make a push implicit, weaken protected-branch safeguards, or enable alerts without an explicit opt-in.

## Releases

Only maintainers create `companion-v<version>` tags. The release workflow creates deterministic bundles, checksums, keyless Sigstore bundles, and GitHub provenance. Never upload locally generated unsigned development artifacts as a production release.
