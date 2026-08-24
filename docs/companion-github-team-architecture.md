# Autopilot Studio: Companion, GitHub, and Team Workflow Architecture

## Product boundary

Autopilot Studio remains a **control plane**, not a remote code executor. The local companion is the only component that watches files, reads Git state, runs secret checks, creates commits, or performs pushes. Studio stores safety policies, action metadata, reviewer decisions, and limited GitHub connection metadata. It must never receive repository contents, private keys, local Git credentials, unredacted diffs, or commit payloads.

| Component | Responsibility | Explicitly excluded |
|---|---|---|
| Local companion | File watching, local policy verification, redacted action digest creation, Git execution after authorization | Remote policy editing, remote credential sharing, bypassing a failed policy check |
| Studio API | Device registration, signed policy snapshots, queue decisions, audit receipts, team approvals | Git execution, diff/content storage, force pushing |
| GitHub App authorization | Repository identity and branch-protection visibility for selected installations | Repository-content writes, branch-protection changes, webhook management |
| Team approval workflow | Roles, quorum policy, approval and rejection records | Implicit approval, self-approval where a rule disallows it, source-code access |

## Companion protocol

The companion registers once using an owner-approved one-time pairing code. Studio then issues a **device-specific opaque access token**, stored only by the companion, and a policy-signing key identifier. The device token is sent in an authorization header for every call; tokens are hashed in storage and can be revoked immediately. Each request includes a unique nonce, an issued-at timestamp, and a request signature. Studio rejects expired timestamps, replayed nonces, mismatched device IDs, invalid signatures, unknown repositories, and payloads containing prohibited content fields.

| Flow | Direction | Data allowed | Required gate |
|---|---|---|---|
| Pair device | Companion → Studio | Device label, public signing key, pairing code | Pairing code is single use and short lived |
| Fetch policy | Companion ← Studio | Signed snapshot, policy revision, allowed repository ID, expiry | Device token and device ownership check |
| Submit candidate | Companion → Studio | Branch, action type, changed-file count, redacted summary, risk level, policy revision | Signature, nonce, policy revision match, no source/diff fields |
| Fetch decision | Companion ← Studio | Approved/rejected/expired status and approval receipt | Quorum reached, action not expired, unchanged payload digest |
| Submit receipt | Companion → Studio | Outcome, generated commit hash, timestamp, local error category | Signed request and action/decision correlation |

The policy snapshot is a canonical JSON object containing a policy revision, repository ID, protected branches, ignore rules, debounce time, approval modes, secret-risk mode, approval quorum, expiry, and a SHA-256 digest. Studio signs the canonical snapshot; the companion verifies both the signature and expiry before executing any action. A policy revision change invalidates previously fetched approval decisions.

## GitHub authorization choice

GitHub recommends GitHub Apps over conventional OAuth Apps because they offer fine-grained permissions, selected-repository installation access, short-lived installation tokens, and centralized webhooks. A conventional OAuth App would need broad `repo` access for private repository resources; that would contradict Autopilot's least-privilege goal. [1] [2]

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---|
| **GitHub App with user authorization** | Recommended. Users install it only on selected repositories; request read-only repository metadata and read-only Administration for branch-protection visibility. Requires GitHub App registration and OAuth callback secrets. | No additional platform cost | Moderate |
| Conventional GitHub OAuth App | Faster initial setup, but private-repository access requires broad `repo` scope rather than targeted permissions. Not appropriate as the default. | No additional platform cost | Lower |

The first release therefore uses a GitHub App authorization flow with only **Repository metadata: read** and **Administration: read** permissions. Administration read is required for the branch-protection endpoint. Studio will use the connection only to identify installed repositories and read default-branch protection status. It will not request Contents, Pull requests, Checks, Commit statuses, Webhooks, or write permissions. [2] [3]

## Team and approval model

Each workspace has an owner, administrators, reviewers, and members. Owners and administrators manage memberships and repository-specific approval rules. Reviewers can approve or reject queued actions. Members can view permitted repositories and submit local companion actions for review. A reviewer cannot approve their own action when the repository rule requires separation of duties.

| Role | Key permissions |
|---|---|
| Owner | Manage workspace, connections, members, rules, and recovery policy |
| Admin | Manage members, policies, devices, and repository approval rules |
| Reviewer | Approve or reject eligible actions and inspect metadata |
| Member | Submit action metadata and view permitted action history |

Each repository rule defines whether commits and pushes need review, whether the actor may self-approve, the approval quorum from one to five, and action expiry. Studio only marks an action approved when the number of distinct eligible reviewer approvals meets the quorum. A rejection, policy revision mismatch, risk escalation, revoked device, or expiry blocks execution.

## References

[1] [GitHub: Differences between GitHub Apps and OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)

[2] [GitHub: Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

[3] [GitHub: REST API endpoints for protected branches](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2026-03-10)
