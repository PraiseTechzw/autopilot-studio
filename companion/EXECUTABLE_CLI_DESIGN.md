# Executable Companion CLI Design

The executable companion remains a **local tool**. It reads Git status, stages files, creates a commit, and optionally pushes only on the user’s machine. Studio receives policy and action metadata, never file names, diffs, source contents, remotes, or Git credentials.

| Mode | Behavior | Trade-off | Default |
|---|---|---|---|
| `run` | Inspects the repository once, verifies the policy, queues a candidate, waits for approval, and then performs one locally approved action. | Requires a deliberate invocation for each cycle. | **Yes** |
| `watch` | Watches the working directory and starts a debounced `run` cycle only after the user explicitly enables continuous execution. | Convenient, but the terminal process must remain open; no background service is installed. | No |
| `dry-run` | Performs all local safety checks and request signing without staging, committing, pushing, or sending an execution receipt. | Does not validate actual Git execution. | Available in every mode |

## Required execution gate

Before any Git write, the CLI must confirm all of the following: the path is a Git work tree; no merge, rebase, or cherry-pick is in progress; the target branch is not a protected branch; the branch and changed-file metadata match the approved candidate; a signed policy receipt was locally verified and explicitly acknowledged; the decision is approved, unexpired, and policy-current; and the work tree has not changed since candidate preparation.

The CLI uses only Git’s local process invocation. It never saves a remote URL or accesses credentials. A push is opt-in (`--push`) and still requires its own approved `push` action. The CLI exits without touching the work tree if any gate fails.
