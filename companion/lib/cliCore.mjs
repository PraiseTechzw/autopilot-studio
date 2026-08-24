import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) { options._.push(value); continue; }
    const key = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else { options[key] = next; index += 1; }
  }
  return options;
}

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

export async function git(repositoryPath, args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync("git", ["-C", repositoryPath, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim(), code: 0 };
  } catch (error) {
    if (!allowFailure) throw new Error(`Git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
    return { ok: false, stdout: String(error.stdout || "").trim(), stderr: String(error.stderr || error.message).trim(), code: Number(error.code ?? 1) };
  }
}

export function parsePorcelain(output) {
  return output.split("\n").filter(Boolean).map(line => line.length > 3 ? line.slice(3).replace(/^.* -> /, "") : "").filter(Boolean);
}

export function matchesIgnore(path, patterns) {
  return patterns.some(pattern => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(path) || path.includes(`/${pattern.replace(/\*.*$/, "")}`);
  });
}

export function assessRepositorySafety(input) {
  const reasons = [];
  if (!input.isWorkTree) reasons.push("not_a_git_work_tree");
  if (!input.branch || input.branch === "HEAD") reasons.push("detached_head");
  if (input.operationInProgress) reasons.push("merge_rebase_or_cherry_pick_in_progress");
  if (input.protectedBranches.includes(input.branch)) reasons.push("protected_branch");
  if (input.changedFiles.length === 0 && !input.allowCleanWorktree) reasons.push("no_local_changes");
  if (input.eligibleFiles.length === 0 && input.changedFiles.length > 0) reasons.push("only_ignored_changes");
  if (input.secretRisk && input.secretRiskMode === "block") reasons.push("local_secret_risk_detected");
  return { safe: reasons.length === 0, reasons };
}

export function createCandidateMetadata({ kind, branch, changedFileCount, riskLevel, policyRevision, policyDigest }) {
  return {
    kind,
    branch,
    changedFiles: changedFileCount,
    riskLevel,
    summary: `Local ${kind} request: ${changedFileCount} changed file${changedFileCount === 1 ? "" : "s"} on ${branch}.`,
    policyRevision,
    policyDigest,
  };
}

export function buildCommitGitCommands(files, message) {
  return [["add", "--", ...files], ["commit", "-m", message]];
}

export function buildPushGitCommand() { return ["push"]; }

export function shouldPauseWatch(errorMessage) {
  return /Safety gate stopped:|Repository or policy changed after approval|Policy changed after push approval/.test(String(errorMessage));
}

export function createWatchGate() {
  let paused = false;
  return {
    isPaused: () => paused,
    pause: () => { paused = true; },
    run: async operation => {
      if (paused) return { paused: true };
      try {
        await operation();
        return { paused: false };
      } catch (error) {
        if (shouldPauseWatch(error?.message)) paused = true;
        return { paused, error };
      }
    },
  };
}

export function fingerprintRepository({ branch, files, policyDigest }) {
  return sha256(JSON.stringify({ branch, files: [...files].sort(), policyDigest }));
}

export function containsSecretRisk(text) {
  return /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"'\s]{12,}/i.test(text);
}

export async function scanFilesForSecrets(repositoryPath, paths) {
  for (const relativePath of paths) {
    try {
      const content = await readFile(new URL(relativePath, `file://${repositoryPath.replace(/\\/g, "/")}/`), "utf8");
      if (containsSecretRisk(content.slice(0, 1024 * 1024))) return true;
    } catch {
      // Deleted, binary, or unreadable files are never uploaded; Git will handle them locally.
    }
  }
  return false;
}
