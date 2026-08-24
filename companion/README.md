# Autopilot Companion CLI

Autopilot Companion is a **local Node.js CLI**. It signs requests to Studio, verifies policy receipts on the device, queues only metadata, and uses Git only after the separate approval gate returns `approved`. It does not upload diffs, file names, source contents, remote URLs, or Git credentials.

## Install and pair

Run from the Studio repository or package directory with Node.js 20 or newer.

```bash
pnpm companion pair https://YOUR-STUDIO-URL YOUR_ONE_TIME_PAIRING_CODE "Laptop"
```

The pairing command writes a device token and private key to `~/.config/autopilot-studio/companion.json` with owner-only permissions. Never commit that file or share a pairing code.

## Inspect before execution

```bash
pnpm companion status --repo /path/to/repository --repository-id 12
pnpm companion run --repo /path/to/repository --repository-id 12 --message "feat: local change" --dry-run
```

`status` fetches and acknowledges the signed policy receipt, then submits one signed, metadata-only local status receipt to Studio. It includes the policy revision/digest, sanitized branch, safe-or-blocked outcome, controlled safety reasons, changed/eligible counts, CLI version, and observation time. It never includes file names, diffs, source contents, remotes, or credentials. Status freshness is visible for 15 minutes in Studio and is not a substitute for policy acknowledgement. `run --dry-run` performs the full policy and approval flow but **never stages, commits, or pushes**.

## Download and verify a published release

Use the Studio **Download Companion** page or the matching GitHub release tagged `companion-v<version>`. Published macOS, Linux, and Windows bundles require Node.js 20 or newer and contain the same local source entry point.

Before extracting a published bundle, download `SHA256SUMS` from the same release and verify it:

```bash
shasum -a 256 -c SHA256SUMS
# Linux alternative: sha256sum -c SHA256SUMS
```

The tag workflow generates GitHub provenance and keyless Sigstore bundles; no persistent private signing key is embedded in the source, package, or CI configuration. Verify an asset and its adjacent `.sigstore.json` bundle with the exact repository workflow identity published on the Download page, then verify GitHub provenance:

```bash
cosign verify-blob --bundle <asset>.sigstore.json \
  --certificate-identity-regexp '<workflow-identity-regexp>' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com <asset>

gh attestation verify <asset> -R PraiseTechzw/autopilot-studio
```

`pnpm companion:package` produces a deterministic local development bundle with `manifest.json` and `SHA256SUMS`; `pnpm companion:verify-release` revalidates those checksums. These local artifacts are deliberately **unsigned** and are not a replacement for a release workflow that has run on a protected GitHub tag.

## Safe local defaults

```bash
pnpm companion config path
pnpm companion config get watch-interval
pnpm companion config set watch-interval 30
pnpm companion config set settle-seconds 15
pnpm companion config set default-wait-seconds 300
```

Configuration commands expose only non-secret execution defaults. The device token and private key are never printed or set through this command.

## Approved local execution

```bash
pnpm companion run --repo /path/to/repository --repository-id 12 --message "feat: approved local change" --wait-seconds 300
pnpm companion run --repo /path/to/repository --repository-id 12 --message "feat: approved local change" --push --wait-seconds 300
```

The first command may commit only after its dedicated commit approval. `--push` asks for a separate push approval after the commit; push is never implied by a commit. The CLI rechecks the repository and policy after approval, and reports a receipt only after local Git returns.

## Opt-in watch mode

```bash
pnpm companion watch --repo /path/to/repository --repository-id 12 --message "chore: reviewed local changes" --enable-watch
pnpm companion watch --repo /path/to/repository --repository-id 12 --message "chore: reviewed local changes" --enable-watch --execute --interval 30
```

Watch mode is **dry-run by default**, polls only while the local terminal remains open, and requires both `--enable-watch` and `--execute` before it is permitted to make any local Git write. Executing watch cycles wait up to five minutes for a reviewer unless you override `--wait-seconds`. Every cycle still requires a current signed policy receipt and a fresh approval decision.

## Hard safety stops

The CLI exits without modifying the work tree when it sees a protected branch, a merge/rebase/cherry-pick, detached HEAD, no eligible changes, a changed repository after approval, a changed policy receipt, a rejected or expired decision, or a local secret-risk match when policy is configured to block.
