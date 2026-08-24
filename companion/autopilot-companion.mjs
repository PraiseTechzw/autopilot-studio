#!/usr/bin/env node
/**
 * Autopilot Companion reference client. It communicates only metadata and
 * executes no Git commands. Add local file watching and Git execution only
 * after policy verification and an approved decision are in place.
 */
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const configPath = process.env.AUTOPILOT_COMPANION_CONFIG || join(homedir(), ".config", "autopilot-studio", "companion.json");

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function usage() { console.error("Usage: autopilot-companion.mjs pair <server> <pairing-code> [label] | policy <repository-id> | queue <repository-id> <commit|push> <branch> <changed-files> <low|medium|high> <summary> | decision <action-id> <payload-digest> <policy-digest> | receipt <action-id> <payload-digest> <completed|failed|blocked> [commit-hash]"); process.exit(1); }
async function loadConfig() { return JSON.parse(await readFile(configPath, "utf8")); }
async function saveConfig(config) { await mkdir(dirname(configPath), { recursive: true }); await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); }
async function request(server, path, body) { const response = await fetch(`${server.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`); return payload; }
function envelope(config, path, body) { const bare = { deviceId: config.deviceId, nonce: randomBytes(24).toString("base64url"), issuedAt: Date.now() }; const signingPayload = ["AUTOPILOT-COMPANION-V1", path, bare.deviceId, bare.nonce, String(bare.issuedAt), sha256(stable(body))].join("\n"); return { ...bare, token: config.deviceToken, signature: sign(null, Buffer.from(signingPayload), { key: Buffer.from(config.privateKey, "base64"), format: "der", type: "pkcs8" }).toString("base64") }; }
function policyMac(token, policyDigest) { return createHmac("sha256", token).update(policyDigest).digest("base64url"); }

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

if (command === "pair") {
  const [server, pairingCode, label = "Local companion"] = args;
  if (!server || !pairingCode) usage();
  const pair = generateKeyPairSync("ed25519");
  const deviceId = `device_${randomBytes(18).toString("base64url")}`;
  const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const result = await request(server, "/api/companion/register", { pairingCode, deviceId, label, publicKey });
  await saveConfig({ server, deviceId, deviceToken: result.deviceToken, privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") });
  console.log(`Paired ${label}. Config saved at ${configPath}.`);
} else if (command === "policy") {
  const repositoryId = Number(args[0]);
  if (!Number.isInteger(repositoryId)) usage();
  const config = await loadConfig();
  const body = { repositoryId };
  const result = await request(config.server, "/api/companion/policy", { ...envelope(config, "/companion/policy", body), ...body });
  if (result.signatureAlgorithm !== "HMAC-SHA256/device-bound" || result.signature !== policyMac(config.deviceToken, result.policyDigest)) throw new Error("Policy receipt verification failed; do not execute or queue an action.");
  console.log(JSON.stringify(result, null, 2));
} else if (command === "queue") {
  const [repositoryIdValue, kind, branch, changedFilesValue, riskLevel, ...summaryParts] = args;
  const repositoryId = Number(repositoryIdValue); const changedFiles = Number(changedFilesValue); const summary = summaryParts.join(" ");
  if (!Number.isInteger(repositoryId) || !["commit", "push"].includes(kind) || !Number.isInteger(changedFiles) || !["low", "medium", "high"].includes(riskLevel) || !summary) usage();
  const config = await loadConfig();
  const policyBody = { repositoryId };
  const policy = await request(config.server, "/api/companion/policy", { ...envelope(config, "/companion/policy", policyBody), ...policyBody });
  if (policy.signature !== policyMac(config.deviceToken, policy.policyDigest)) throw new Error("Policy receipt verification failed; do not queue an action.");
  const candidate = { repositoryId, kind, branch, changedFiles, riskLevel, summary, policyRevision: policy.snapshot.revision, policyDigest: policy.policyDigest };
  const result = await request(config.server, "/api/companion/actions", { ...envelope(config, "/companion/submit-candidate", candidate), candidate });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "receipt") {
  const [actionIdValue, payloadDigest, outcome, commitHash] = args; const actionId = Number(actionIdValue);
  if (!Number.isInteger(actionId) || !/^[a-f0-9]{64}$/.test(payloadDigest || "") || !["completed", "failed", "blocked"].includes(outcome)) usage();
  const config = await loadConfig();
  const receipt = { actionId, payloadDigest, outcome, ...(commitHash ? { commitHash } : {}) };
  const result = await request(config.server, "/api/companion/receipts", { ...envelope(config, "/companion/submit-receipt", receipt), ...receipt });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "decision") {
  const [actionIdValue, payloadDigest, policyDigest] = args; const actionId = Number(actionIdValue);
  if (!Number.isInteger(actionId) || !/^[a-f0-9]{64}$/.test(payloadDigest || "") || !/^[a-f0-9]{64}$/.test(policyDigest || "")) usage();
  const config = await loadConfig();
  const decision = { actionId, payloadDigest, policyDigest };
  const result = await request(config.server, "/api/companion/decision", { ...envelope(config, "/companion/decision", decision), ...decision });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "approved") process.exitCode = 2;
} else usage();
