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

`status` fetches and acknowledges the signed policy receipt, then reports only high-level safety metadata. `run --dry-run` performs the full policy and approval flow but **never stages, commits, or pushes**.

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
