import { createHmac, generateKeyPairSync } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { assessRepositorySafety, buildCommitGitCommands, buildPushGitCommand, createCandidateMetadata, createWatchGate, parseOptions, shouldPauseWatch } from "../companion/lib/cliCore.mjs";

const execFile = promisify(execFileCallback);
const cleanups: string[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("executable companion CLI", () => {
  it("keeps policy preparation metadata-only and blocks protected branches", () => {
    const candidate = createCandidateMetadata({ kind: "commit", branch: "feature/local", changedFileCount: 3, riskLevel: "low", policyRevision: 2, policyDigest: "a".repeat(64) });
    expect(candidate.summary).toContain("3 changed files");
    expect(candidate.summary).not.toMatch(/\.ts|\.env|src\//);
    expect(assessRepositorySafety({ isWorkTree: true, branch: "main", operationInProgress: false, protectedBranches: ["main"], changedFiles: ["private.txt"], eligibleFiles: ["private.txt"], secretRisk: false, secretRiskMode: "block" })).toMatchObject({ safe: false, reasons: ["protected_branch"] });
    expect(assessRepositorySafety({ isWorkTree: true, branch: "feature/local", operationInProgress: false, protectedBranches: ["main"], changedFiles: [], eligibleFiles: [], secretRisk: false, secretRiskMode: "block", allowCleanWorktree: true })).toMatchObject({ safe: true, reasons: [] });
    expect(buildCommitGitCommands(["a.txt", "folder/b.txt"], "feat: local")).toEqual([["add", "--", "a.txt", "folder/b.txt"], ["commit", "-m", "feat: local"]]);
    expect(buildPushGitCommand()).toEqual(["push"]);
    expect(shouldPauseWatch("Safety gate stopped: protected_branch.")).toBe(true);
    expect(parseOptions(["--repo", ".", "--dry-run", "--wait-seconds", "0"])) .toMatchObject({ repo: ".", "dry-run": true, "wait-seconds": "0" });
  });

  it("executes the full policy and approval path as a dry run without staging, committing, or pushing a disposable repository", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "autopilot-cli-")); cleanups.push(fixture);
    await execFile("git", ["init", "-q", fixture]);
    await writeFile(join(fixture, "change.txt"), "local metadata test\n");
    const token = "device-token-for-test-only";
    const keyPair = generateKeyPairSync("ed25519");
    const config = join(fixture, "companion.json");
    await writeFile(config, JSON.stringify({ server: "http://127.0.0.1:0", deviceId: "device_test_1234567890", deviceToken: token, privateKey: keyPair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") }));
    const digest = "a".repeat(64); const payloadDigest = "b".repeat(64);
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const path = request.url || "";
      const payload = path === "/api/companion/policy" ? { snapshot: { revision: 1, protectedBranches: [], ignoreRules: [], secretRiskMode: "block" }, policyDigest: digest, signatureAlgorithm: "HMAC-SHA256/device-bound", signature: createHmac("sha256", token).update(digest).digest("base64url") }
        : path === "/api/companion/actions" ? { actionId: 11, payloadDigest, expiresAt: new Date(Date.now() + 60_000).toISOString() }
        : path === "/api/companion/decision" ? { status: "approved", actionId: 11, policyRevision: 1 }
        : { acknowledgedAt: new Date().toISOString(), policyRevision: 1 };
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(payload));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
    await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${port}`, deviceId: "device_test_1234567890", deviceToken: token, privateKey: keyPair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") }));
    try {
      const result = await execFile(process.execPath, ["companion/autopilot.mjs", "run", "--repo", fixture, "--repository-id", "1", "--message", "test local dry run", "--dry-run"], { cwd: process.cwd(), env: { ...process.env, AUTOPILOT_COMPANION_CONFIG: config } });
      expect(result.stdout).toContain("dry_run_approved");
      const status = await execFile("git", ["-C", fixture, "status", "--porcelain"]);
      expect(status.stdout).toContain("change.txt");
      expect((await execFile("git", ["-C", fixture, "diff", "--cached", "--name-only"])).stdout).toBe("");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it("submits metadata-only signed status after local inspection without exposing a path or source content", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "autopilot-status-")); cleanups.push(fixture);
    await execFile("git", ["init", "-q", fixture]); await writeFile(join(fixture, "private-source-name.ts"), "const secret = 'not transmitted';\n");
    const token = "device-token-for-status-test"; const pair = generateKeyPairSync("ed25519"); let submitted: Record<string, unknown> | null = null;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (request.url === "/api/companion/status") submitted = body.status;
      const digest = "c".repeat(64);
      const payload = request.url === "/api/companion/policy" ? { snapshot: { revision: 1, protectedBranches: [], ignoreRules: [], secretRiskMode: "block" }, policyDigest: digest, signatureAlgorithm: "HMAC-SHA256/device-bound", signature: createHmac("sha256", token).update(digest).digest("base64url") } : request.url === "/api/companion/status" ? { receiptId: 99, receivedAt: new Date().toISOString() } : { acknowledgedAt: new Date().toISOString(), policyRevision: 1 };
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(payload));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
    const config = join(fixture, "companion.json"); await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${port}`, deviceId: "device_status_1234567890", deviceToken: token, privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") }));
    try {
      const result = await execFile(process.execPath, ["companion/autopilot.mjs", "status", "--repo", fixture, "--repository-id", "1"], { cwd: process.cwd(), env: { ...process.env, AUTOPILOT_COMPANION_CONFIG: config } });
      expect(result.stdout).toContain("statusReceipt");
      expect(submitted).toMatchObject({ repositoryId: 1, safetyStatus: "safe", companionVersion: "1.0.0" });
      expect(Number(submitted?.changedFiles)).toBeGreaterThan(0);
      expect(submitted?.eligibleFiles).toBe(submitted?.changedFiles);
      expect(JSON.stringify(submitted)).not.toContain("private-source-name.ts");
      expect(JSON.stringify(submitted)).not.toContain("not transmitted");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it("refuses to start watch mode unless continuous local monitoring is explicitly enabled", async () => {
    const result = await execFile(process.execPath, ["companion/autopilot.mjs", "watch", "--repo", ".", "--repository-id", "1", "--message", "test watch"], { cwd: process.cwd() }).catch(error => error as { stderr: string });
    expect(result.stderr).toContain("Watch mode is disabled by default");
  });

  it("pauses the actual watch gate and skips later cycles after an unsafe repository error", async () => {
    const gate = createWatchGate(); let attempts = 0;
    const first = await gate.run(async () => { attempts += 1; throw new Error("Safety gate stopped: protected_branch."); });
    const second = await gate.run(async () => { attempts += 1; });
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(true);
    expect(attempts).toBe(1);
  });
});
