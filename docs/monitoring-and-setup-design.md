# Monitoring and Guided Setup Design

## Monitoring model

The monitoring view must report **decision and policy metadata only**. It must never display diffs, file names, source contents, local paths, Git credentials, or full commit messages. Each repository panel shows the number of pending, approved, rejected, expired, and blocked actions; the newest recorded policy revision; the time a paired device last confirmed a policy snapshot; and whether the snapshot is current, stale, or absent.

| Signal | Source | Interpretation |
|---|---|---|
| Pending approvals | Queued actions with `pending` status | A reviewer decision is still required before a companion may run the action. |
| Decision ledger | Queued action status and review timestamp | Shows reviewed and rejected metadata without exposing code. |
| Policy revision | Automation policy revision | Increments when controls change; a companion must re-fetch a snapshot after a revision changes. |
| Snapshot freshness | Device receipt metadata and last-seen time | `Current` when the device has observed the active revision recently; `Stale` or `Unseen` otherwise. |
| Execution boundary | Signed decision gate | Local execution is allowed only for an approved, unexpired action whose policy receipt is current. |

## Guided setup milestones

The setup wizard follows a strict local-first sequence: confirm GitHub App permissions, provide the published callback destination, begin authorization, select repositories, pair a local companion, then verify a policy snapshot. Every step describes what data is used and what is explicitly excluded. Steps can be revisited; the wizard never reports a connection as complete solely because a button was clicked.

## OAuth feedback state model

| State | User-facing explanation | Next action |
|---|---|---|
| Not connected | No GitHub App token has been stored. | Start authorization. |
| Authorizing | The user has been sent to GitHub; Studio is awaiting a callback. | Complete or cancel at GitHub. |
| Connected | An encrypted token and GitHub identity are available. | Refresh and select repositories. |
| Attention | A repository catalog or branch-protection check needs attention. | Refresh catalog or reconnect. |
| Expired or revoked | The token is no longer valid. | Reconnect GitHub. |
| Error | Authorization did not complete safely. | Review the reason and retry. |
