import { createHash, createHmac, createPublicKey, verify } from "node:crypto";
import { getActiveCompanionDevice, rememberCompanionNonce, touchCompanionDevice } from "./companionDb";

export type CompanionEnvelope = {
  deviceId: string;
  token: string;
  nonce: string;
  issuedAt: number;
  signature: string;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signPolicyDigest(deviceToken: string, policyDigest: string): string {
  return createHmac("sha256", deviceToken).update(policyDigest).digest("base64url");
}

export function createRequestSigningPayload(path: string, envelope: Omit<CompanionEnvelope, "token" | "signature">, body: unknown) {
  return ["AUTOPILOT-COMPANION-V1", path, envelope.deviceId, envelope.nonce, String(envelope.issuedAt), sha256(canonicalJson(body))].join("\n");
}

export async function authenticateCompanion(path: string, envelope: CompanionEnvelope, body: unknown) {
  if (!Number.isSafeInteger(envelope.issuedAt) || Math.abs(Date.now() - envelope.issuedAt) > 5 * 60 * 1000) return null;
  if (envelope.nonce.length < 24 || envelope.nonce.length > 256) return null;
  const device = await getActiveCompanionDevice(envelope.deviceId, sha256(envelope.token));
  if (!device) return null;
  const signingPayload = createRequestSigningPayload(path, envelope, body);
  try {
    const publicKey = createPublicKey({ key: Buffer.from(device.publicKey, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(signingPayload), publicKey, Buffer.from(envelope.signature, "base64"))) return null;
  } catch {
    return null;
  }
  const nonceAccepted = await rememberCompanionNonce({ deviceId: device.id, nonceHash: sha256(`${device.id}:${envelope.nonce}`), expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  if (!nonceAccepted) return null;
  await touchCompanionDevice(device.id);
  return device;
}

export function policySnapshotPayload(policy: { revision: number; protectedBranches: string; debounceSeconds: number; commitApprovalMode: string; pushApprovalMode: string; ignoreRules: string; secretRiskMode: string }, repository: { id: number; defaultBranch: string }, rule: { approvalQuorum: number; allowSelfApproval: boolean; actionExpiryMinutes: number; commitRequiresApproval: boolean; pushRequiresApproval: boolean } | null) {
  const policyContent = {
    version: "1",
    revision: policy.revision,
    repositoryId: repository.id,
    defaultBranch: repository.defaultBranch,
    protectedBranches: JSON.parse(policy.protectedBranches),
    ignoreRules: JSON.parse(policy.ignoreRules),
    debounceSeconds: policy.debounceSeconds,
    commitApprovalMode: policy.commitApprovalMode,
    pushApprovalMode: policy.pushApprovalMode,
    secretRiskMode: policy.secretRiskMode,
    approval: rule ? { commitRequiresApproval: rule.commitRequiresApproval, pushRequiresApproval: rule.pushRequiresApproval, approvalQuorum: rule.approvalQuorum, allowSelfApproval: rule.allowSelfApproval, actionExpiryMinutes: rule.actionExpiryMinutes } : null,
  };
  const snapshot = { ...policyContent, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
  return { snapshot, policyDigest: sha256(canonicalJson(policyContent)) };
}
