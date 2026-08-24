#!/usr/bin/env node
/**
 * Executable local companion. Git actions remain on this machine and are
 * performed only after Studio returns an approved, current, signed decision.
 */
import { createHmac, randomBytes, sign } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { assessRepositorySafety, buildCommitGitCommands, buildPushGitCommand, createCandidateMetadata, createWatchGate, fingerprintRepository, git, matchesIgnore, parseOptions, parsePorcelain, scanFilesForSecrets, sha256 } from "./lib/cliCore.mjs";

const configPath = process.env.AUTOPILOT_COMPANION_CONFIG || join(homedir(), ".config", "autopilot-studio", "companion.json");
const CLI_VERSION = "1.0.0";
const usage = `Autopilot Companion\n\nCommands:\n  pair <studio-url> <pairing-code> [label]  Pair this device using the secure reference flow\n  status --repo <path> --repository-id <id>  Inspect local safety and the current signed policy\n  run --repo <path> --repository-id <id> --message <text> [--push] [--wait-seconds 0] [--dry-run]\n  watch --repo <path> --repository-id <id> --message <text> --enable-watch [--execute] [--push] [--interval 20] [--settle-seconds 10]\n  config path | get <key> | set <key> <value>  Manage safe non-secret local defaults\n\nSafety defaults: run never pushes unless --push is supplied; watch requires --enable-watch and is dry-run unless --execute is supplied.`;

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}
async function loadConfig() { return JSON.parse(await readFile(configPath, "utf8")); }
async function saveConfig(config) { await mkdir(dirname(configPath), { recursive: true }); await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); }
async function request(server, path, body) {
  const response = await fetch(`${server.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Studio request failed with ${response.status}`);
  return payload;
}
function envelope(config, path, body) {
  const bare = { deviceId: config.deviceId, nonce: randomBytes(24).toString("base64url"), issuedAt: Date.now() };
  const signingPayload = ["AUTOPILOT-COMPANION-V1", path, bare.deviceId, bare.nonce, String(bare.issuedAt), sha256(stable(body))].join("\n");
  return { ...bare, token: config.deviceToken, signature: sign(null, Buffer.from(signingPayload), { key: Buffer.from(config.privateKey, "base64"), format: "der", type: "pkcs8" }).toString("base64") };
}
function policyMac(token, policyDigest) { return createHmac("sha256", token).update(policyDigest).digest("base64url"); }
function requireOption(options, name) { if (!options[name] || options[name] === true) throw new Error(`--${name} is required.`); return String(options[name]); }
function parseRepositoryId(options) { const value = Number(requireOption(options, "repository-id")); if (!Number.isInteger(value) || value < 1) throw new Error("--repository-id must be a positive integer."); return value; }

async function hasGitOperation(repositoryPath) {
  const checks = [["rev-parse", "-q", "--verify", "MERGE_HEAD"], ["rev-parse", "-q", "--verify", "REBASE_HEAD"], ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"]];
  const results = await Promise.all(checks.map(args => git(repositoryPath, args, { allowFailure: true })));
  return results.some(result => result.ok);
}

async function fetchAndConfirmPolicy(config, repositoryId) {
  const policyBody = { repositoryId };
  const policy = await request(config.server, "/api/companion/policy", { ...envelope(config, "/companion/policy", policyBody), ...policyBody });
  if (policy.signatureAlgorithm !== "HMAC-SHA256/device-bound" || policy.signature !== policyMac(config.deviceToken, policy.policyDigest)) throw new Error("Signed policy receipt verification failed. No local action was performed.");
  const confirmation = { repositoryId, policyRevision: policy.snapshot.revision, policyDigest: policy.policyDigest };
  await request(config.server, "/api/companion/policy-confirmations", { ...envelope(config, "/companion/confirm-policy", confirmation), ...confirmation });
  return policy;
}

async function inspectRepository(repositoryPath, policy, { allowCleanWorktree = false } = {}) {
  const isWorkTree = (await git(repositoryPath, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true })).stdout === "true";
  const branch = (await git(repositoryPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })).stdout;
  const status = await git(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"], { allowFailure: true });
  const changedFiles = status.ok ? parsePorcelain(status.stdout) : [];
  const protectedBranches = Array.isArray(policy.snapshot.protectedBranches) ? policy.snapshot.protectedBranches : [];
  const ignoreRules = Array.isArray(policy.snapshot.ignoreRules) ? policy.snapshot.ignoreRules : [];
  const eligibleFiles = changedFiles.filter(path => !matchesIgnore(path, ignoreRules));
  const secretRisk = await scanFilesForSecrets(repositoryPath, eligibleFiles);
  const operationInProgress = await hasGitOperation(repositoryPath);
  const secretRiskMode = policy.snapshot.secretRiskMode || "block";
  const safety = assessRepositorySafety({ isWorkTree, branch, operationInProgress, protectedBranches, changedFiles, eligibleFiles, secretRisk, secretRiskMode, allowCleanWorktree });
  const riskLevel = secretRisk ? "high" : eligibleFiles.length > 25 ? "medium" : "low";
  return { isWorkTree, branch, changedFiles, eligibleFiles, secretRisk, operationInProgress, secretRiskMode, safety, riskLevel, fingerprint: fingerprintRepository({ branch, files: eligibleFiles, policyDigest: policy.policyDigest }) };
}

async function waitForDecision(config, actionId, payloadDigest, policyDigest, waitSeconds) {
  const deadline = Date.now() + Math.max(0, waitSeconds) * 1000;
  do {
    const decision = { actionId, payloadDigest, policyDigest };
    const result = await request(config.server, "/api/companion/decision", { ...envelope(config, "/companion/decision", decision), ...decision });
    if (result.status !== "pending") return result;
    if (Date.now() >= deadline) return result;
    await new Promise(resolveSleep => setTimeout(resolveSleep, 5000));
  } while (true);
}

async function submitReceipt(config, actionId, payloadDigest, outcome, extra = {}) {
  const receipt = { actionId, payloadDigest, outcome, ...extra };
  return request(config.server, "/api/companion/receipts", { ...envelope(config, "/companion/submit-receipt", receipt), ...receipt });
}

async function submitStatusReceipt(config, repositoryId, policy, inspection) {
  const status = {
    repositoryId,
    policyRevision: policy.snapshot.revision,
    policyDigest: policy.policyDigest,
    branch: inspection.branch || "HEAD",
    safetyStatus: inspection.safety.safe ? "safe" : "blocked",
    safetyReasons: inspection.safety.reasons,
    changedFiles: inspection.changedFiles.length,
    eligibleFiles: inspection.eligibleFiles.length,
    companionVersion: CLI_VERSION,
    observedAt: new Date().toISOString(),
  };
  return request(config.server, "/api/companion/status", { ...envelope(config, "/companion/status", status), status });
}

async function prepareApprovedAction({ config, repositoryId, repositoryPath, kind, waitSeconds }) {
  const policy = await fetchAndConfirmPolicy(config, repositoryId);
  const inspection = await inspectRepository(repositoryPath, policy, { allowCleanWorktree: kind === "push" });
  if (!inspection.safety.safe) throw new Error(`Safety gate stopped: ${inspection.safety.reasons.join(", ")}.`);
  const candidate = createCandidateMetadata({ kind, branch: inspection.branch, changedFileCount: inspection.eligibleFiles.length, riskLevel: inspection.riskLevel, policyRevision: policy.snapshot.revision, policyDigest: policy.policyDigest });
  const action = await request(config.server, "/api/companion/actions", { ...envelope(config, "/companion/submit-candidate", candidate), candidate });
  const decision = await waitForDecision(config, action.actionId, action.payloadDigest, policy.policyDigest, waitSeconds);
  if (decision.status !== "approved") return { approved: false, decision, action, policy, inspection, candidate };
  return { approved: true, decision, action, policy, inspection, candidate };
}

async function executeRun(options, { forcedDryRun = false } = {}) {
  const config = await loadConfig();
  const repositoryPath = resolve(requireOption(options, "repo"));
  const repositoryId = parseRepositoryId(options);
  const message = requireOption(options, "message");
  const waitSeconds = Number(options["wait-seconds"] ?? config.settings?.defaultWaitSeconds ?? 0);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 3600) throw new Error("--wait-seconds must be between 0 and 3600.");
  if (message.length < 3 || message.length > 180 || /[\r\n]/.test(message)) throw new Error("--message must be a single line between 3 and 180 characters.");
  const dryRun = forcedDryRun || Boolean(options["dry-run"]);
  const commit = await prepareApprovedAction({ config, repositoryId, repositoryPath, kind: "commit", waitSeconds });
  if (!commit.approved) { console.log(JSON.stringify({ status: commit.decision.status, actionId: commit.action.actionId, message: "No Git action was performed. Approval is still required or the gate blocked execution." }, null, 2)); process.exitCode = 2; return; }
  const refreshedPolicy = await fetchAndConfirmPolicy(config, repositoryId);
  const refreshed = await inspectRepository(repositoryPath, refreshedPolicy);
  if (!refreshed.safety.safe || refreshed.fingerprint !== commit.inspection.fingerprint || refreshedPolicy.policyDigest !== commit.policy.policyDigest) {
    await submitReceipt(config, commit.action.actionId, commit.action.payloadDigest, "blocked", { errorCategory: "policy" });
    throw new Error("Repository or policy changed after approval. No Git action was performed.");
  }
  if (dryRun) { console.log(JSON.stringify({ status: "dry_run_approved", actionId: commit.action.actionId, changedFiles: refreshed.eligibleFiles.length, pushRequested: Boolean(options.push) }, null, 2)); return; }
  try {
    const [addCommand, commitCommand] = buildCommitGitCommands(refreshed.eligibleFiles, message);
    await git(repositoryPath, addCommand);
    const staged = await git(repositoryPath, ["diff", "--cached", "--quiet"], { allowFailure: true });
    if (staged.ok) throw new Error("No eligible local changes were staged.");
    await git(repositoryPath, commitCommand);
    const commitHash = (await git(repositoryPath, ["rev-parse", "HEAD"])).stdout;
    await submitReceipt(config, commit.action.actionId, commit.action.payloadDigest, "completed", { commitHash });
    console.log(JSON.stringify({ status: "committed", actionId: commit.action.actionId, commitHash }, null, 2));
  } catch (error) {
    await submitReceipt(config, commit.action.actionId, commit.action.payloadDigest, "failed", { errorCategory: "git" });
    throw error;
  }
  if (!options.push) return;
  const push = await prepareApprovedAction({ config, repositoryId, repositoryPath, kind: "push", waitSeconds });
  if (!push.approved) { console.log(JSON.stringify({ status: push.decision.status, actionId: push.action.actionId, message: "Commit succeeded; push was not performed because a separate push approval is required." }, null, 2)); process.exitCode = 2; return; }
  const finalPolicy = await fetchAndConfirmPolicy(config, repositoryId);
  const finalInspection = await inspectRepository(repositoryPath, finalPolicy, { allowCleanWorktree: true });
  if (!finalInspection.safety.safe || finalInspection.branch !== push.inspection.branch || finalInspection.fingerprint !== push.inspection.fingerprint || finalPolicy.policyDigest !== push.policy.policyDigest) {
    await submitReceipt(config, push.action.actionId, push.action.payloadDigest, "blocked", { errorCategory: "policy" });
    throw new Error("Repository or policy changed after push approval. No push was performed.");
  }
  try {
    await git(repositoryPath, buildPushGitCommand());
    const commitHash = (await git(repositoryPath, ["rev-parse", "HEAD"])).stdout;
    await submitReceipt(config, push.action.actionId, push.action.payloadDigest, "completed", { commitHash });
    console.log(JSON.stringify({ status: "pushed", actionId: push.action.actionId, commitHash }, null, 2));
  } catch (error) {
    await submitReceipt(config, push.action.actionId, push.action.payloadDigest, "failed", { errorCategory: "git" });
    throw error;
  }
}

async function showStatus(options) {
  const config = await loadConfig();
  const repositoryPath = resolve(requireOption(options, "repo"));
  const repositoryId = parseRepositoryId(options);
  const policy = await fetchAndConfirmPolicy(config, repositoryId);
  const inspection = await inspectRepository(repositoryPath, policy);
  const receipt = await submitStatusReceipt(config, repositoryId, policy, inspection);
  console.log(JSON.stringify({ branch: inspection.branch, changedFiles: inspection.changedFiles.length, eligibleFiles: inspection.eligibleFiles.length, policyRevision: policy.snapshot.revision, policyReceipt: "confirmed", statusReceipt: receipt.receiptId, safety: inspection.safety, secretRisk: inspection.secretRisk }, null, 2));
}

async function watchRepository(options) {
  if (!options["enable-watch"]) throw new Error("Watch mode is disabled by default. Re-run with --enable-watch after reviewing the policy and approval workflow.");
  const config = await loadConfig();
  const interval = Number(options.interval ?? config.settings?.watchInterval ?? 20);
  if (!Number.isFinite(interval) || interval < 5 || interval > 3600) throw new Error("--interval must be between 5 and 3600 seconds.");
  const settleSeconds = Number(options["settle-seconds"] ?? config.settings?.settleSeconds ?? 10);
  if (!Number.isFinite(settleSeconds) || settleSeconds < 2 || settleSeconds > 600) throw new Error("--settle-seconds must be between 2 and 600 seconds.");
  const execute = Boolean(options.execute);
  if (execute && options["wait-seconds"] === undefined && config.settings?.defaultWaitSeconds === undefined) options["wait-seconds"] = "300";
  console.log(`Watching local repository every ${interval}s with a ${settleSeconds}s settling window. ${execute ? "Execution is enabled and still requires approved current decisions." : "Dry-run only; use --execute to allow local Git writes."} Press Ctrl+C to stop.`);
  let running = false, observed = "", settleTimer = null;
  const watchGate = createWatchGate();
  const runSettledCycle = async () => {
    if (watchGate.isPaused() || running) return;
    running = true;
    try {
      const result = await watchGate.run(() => executeRun(options, { forcedDryRun: !execute }));
      if (result.paused && result.error) console.error(`Watch paused for safety: ${result.error.message} Run \`status\` to review and restart watch after resolving the condition.`);
      else if (result.error) console.error(`Watch cycle stopped safely: ${result.error.message}`);
    }
    finally { running = false; }
  };
  const inspectForChange = async () => {
    if (watchGate.isPaused() || running) return;
    try {
      const repositoryPath = resolve(requireOption(options, "repo"));
      const fingerprint = (await git(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"], { allowFailure: true })).stdout;
      if (!fingerprint) { observed = ""; if (settleTimer) clearTimeout(settleTimer); settleTimer = null; return; }
      if (fingerprint === observed) return;
      observed = fingerprint;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { settleTimer = null; runSettledCycle(); }, settleSeconds * 1000);
      console.log(`Local changes detected. Waiting ${settleSeconds}s for the worktree to settle before preparing a policy-gated action.`);
    } catch (error) { watchGate.pause(); console.error(`Watch paused for safety: ${error.message}`); }
  };
  await inspectForChange();
  setInterval(inspectForChange, interval * 1000);
}

async function configCommand(args) {
  const [subcommand, key, value] = args;
  if (subcommand === "path") { console.log(configPath); return; }
  if (subcommand === "get") {
    const config = await loadConfig();
    const map = { "watch-interval": "watchInterval", "settle-seconds": "settleSeconds", "default-wait-seconds": "defaultWaitSeconds" };
    if (!map[key]) throw new Error("Allowed config keys: watch-interval, settle-seconds, default-wait-seconds.");
    console.log(config.settings?.[map[key]] ?? "unset"); return;
  }
  if (subcommand === "set") {
    const map = { "watch-interval": ["watchInterval", 5, 3600], "settle-seconds": ["settleSeconds", 2, 600], "default-wait-seconds": ["defaultWaitSeconds", 0, 3600] };
    if (!map[key] || value === undefined) throw new Error("Usage: config set <watch-interval|settle-seconds|default-wait-seconds> <number>.");
    const parsed = Number(value); const [configKey, minimum, maximum] = map[key];
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Configuration value must be between ${minimum} and ${maximum}.`);
    const config = await loadConfig(); config.settings = { ...(config.settings || {}), [configKey]: parsed }; await saveConfig(config); console.log(`${key}=${parsed}`); return;
  }
  throw new Error("Usage: config path | config get <key> | config set <key> <value>.");
}

async function pair(args) {
  const reference = new URL("./autopilot-companion.mjs", import.meta.url);
  const child = spawn(process.execPath, [reference.pathname, "pair", ...args], { stdio: "inherit" });
  child.on("exit", code => process.exitCode = code ?? 1);
}

const [command, ...args] = process.argv.slice(2);
const options = parseOptions(args);
try {
  if (!command || command === "help" || command === "--help") console.log(usage);
  else if (command === "pair") await pair(args);
  else if (command === "status") await showStatus(options);
  else if (command === "run") await executeRun(options);
  else if (command === "watch") await watchRepository(options);
  else if (command === "config") await configCommand(args);
  else throw new Error(`Unknown command: ${command}\n\n${usage}`);
} catch (error) {
  console.error(`Autopilot Companion stopped safely: ${error.message}`);
  process.exitCode = 1;
}
