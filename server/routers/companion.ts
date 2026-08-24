import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCompanionDevice, createCompanionPairing, consumeCompanionPairing, getCompanionActionForDevice, getCompanionPolicy, saveExecutionReceipt } from "../companionDb";
import { authenticateCompanion, policySnapshotPayload, sha256, signPolicyDigest } from "../companionProtocol";
import { createQueuedAction, writeActivity } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const envelopeInput = z.object({
  deviceId: z.string().trim().min(12).max(96),
  token: z.string().trim().min(32).max(256),
  nonce: z.string().trim().min(24).max(256),
  issuedAt: z.number().int(),
  signature: z.string().trim().min(32).max(2048),
});

const candidateInput = z.object({
  repositoryId: z.number().int().positive(),
  kind: z.enum(["commit", "push"]),
  branch: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(3).max(280).refine(value => !/[\r\n]/.test(value), "A companion summary must be a single metadata line."),
  changedFiles: z.number().int().min(0).max(100000),
  riskLevel: z.enum(["low", "medium", "high"]),
  policyRevision: z.number().int().positive(),
  policyDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const companionRouter = router({
  createPairing: protectedProcedure.input(z.object({ label: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const pairingCode = randomBytes(24).toString("base64url");
    const pairingId = await createCompanionPairing({ userId: ctx.user.id, label: input.label, pairingCodeHash: sha256(pairingCode), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    if (!pairingId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pairing code could not be created." });
    return { pairingId, pairingCode, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
  }),
  register: publicProcedure.input(z.object({ pairingCode: z.string().trim().min(32).max(256), deviceId: z.string().trim().min(12).max(96), label: z.string().trim().min(2).max(120), publicKey: z.string().trim().min(80).max(2048) }).strict()).mutation(async ({ input }) => {
    const pairing = await consumeCompanionPairing(sha256(input.pairingCode));
    if (!pairing) throw new TRPCError({ code: "UNAUTHORIZED", message: "Pairing code is invalid, expired, or already used." });
    const deviceToken = randomBytes(32).toString("base64url");
    const companionDeviceId = await createCompanionDevice({ userId: pairing.userId, deviceId: input.deviceId, label: input.label, publicKey: input.publicKey, tokenHash: sha256(deviceToken) });
    if (!companionDeviceId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Companion device could not be registered." });
    return { companionDeviceId, deviceToken };
  }),
  policy: publicProcedure.input(envelopeInput.extend({ repositoryId: z.number().int().positive() }).strict()).query(async ({ input }) => {
    const { repositoryId, ...envelope } = input;
    const device = await authenticateCompanion("/companion/policy", envelope, { repositoryId });
    if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "Companion authentication or request signature failed." });
    const policyData = await getCompanionPolicy(device.userId, repositoryId);
    if (!policyData) throw new TRPCError({ code: "NOT_FOUND", message: "Repository policy not found for this companion." });
    const policyReceipt = policySnapshotPayload(policyData.policy, policyData.repository, policyData.approvalRule);
    return { ...policyReceipt, signatureAlgorithm: "HMAC-SHA256/device-bound" as const, signature: signPolicyDigest(envelope.token, policyReceipt.policyDigest) };
  }),
  submitCandidate: publicProcedure.input(envelopeInput.extend({ candidate: candidateInput }).strict()).mutation(async ({ input }) => {
    const { candidate, ...envelope } = input;
    const device = await authenticateCompanion("/companion/submit-candidate", envelope, candidate);
    if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "Companion authentication or request signature failed." });
    const policyData = await getCompanionPolicy(device.userId, candidate.repositoryId);
    if (!policyData) throw new TRPCError({ code: "NOT_FOUND", message: "Repository policy not found for this companion." });
    if (policyData.policy.revision !== candidate.policyRevision) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Policy revision changed. Fetch and verify a new signed snapshot before queuing work." });
    const expectedPolicyDigest = policySnapshotPayload(policyData.policy, policyData.repository, policyData.approvalRule).policyDigest;
    if (candidate.policyDigest !== expectedPolicyDigest) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Policy receipt does not match the active policy. Fetch a new signed snapshot before queuing work." });
    const requiresApproval = candidate.kind === "commit" ? (policyData.approvalRule?.commitRequiresApproval ?? true) : (policyData.approvalRule?.pushRequiresApproval ?? true);
    const payloadDigest = sha256(JSON.stringify(candidate));
    const actionId = await createQueuedAction({ userId: device.userId, actorUserId: device.userId, companionDeviceId: device.id, ...candidate, payloadDigest, expiresAt: new Date(Date.now() + (policyData.approvalRule?.actionExpiryMinutes ?? 60) * 60 * 1000) });
    if (!actionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Candidate action could not be recorded." });
    await writeActivity({ userId: device.userId, repositoryId: candidate.repositoryId, type: "queued", status: candidate.riskLevel === "high" ? "warning" : "info", title: requiresApproval ? "Companion action awaiting approval" : "Companion action recorded", summary: candidate.summary, metadata: JSON.stringify({ actionId, kind: candidate.kind, branch: candidate.branch, changedFiles: candidate.changedFiles, riskLevel: candidate.riskLevel, policyRevision: candidate.policyRevision, payloadDigest }) });
    return { actionId, payloadDigest, requiresApproval, expiresAt: new Date(Date.now() + (policyData.approvalRule?.actionExpiryMinutes ?? 60) * 60 * 1000) };
  }),
  decision: publicProcedure.input(envelopeInput.extend({ actionId: z.number().int().positive(), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/), policyDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).query(async ({ input }) => {
    const { actionId, payloadDigest, policyDigest, ...envelope } = input;
    const requestBody = { actionId, payloadDigest, policyDigest };
    const device = await authenticateCompanion("/companion/decision", envelope, requestBody);
    if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "Companion authentication or request signature failed." });
    const action = await getCompanionActionForDevice({ userId: device.userId, companionDeviceId: device.id, actionId });
    if (!action || action.payloadDigest !== payloadDigest) return { status: "blocked" as const, reason: "action_not_found_or_payload_changed" as const };
    if (action.expiresAt && action.expiresAt.getTime() < Date.now()) return { status: "blocked" as const, reason: "action_expired" as const };
    const policyData = await getCompanionPolicy(device.userId, action.repositoryId);
    if (!policyData || policyData.policy.revision !== action.policyRevision) return { status: "blocked" as const, reason: "policy_revision_changed" as const };
    const currentPolicyDigest = policySnapshotPayload(policyData.policy, policyData.repository, policyData.approvalRule).policyDigest;
    if (currentPolicyDigest !== policyDigest) return { status: "blocked" as const, reason: "policy_receipt_changed" as const };
    if (action.status === "approved") return { status: "approved" as const, actionId, policyRevision: action.policyRevision };
    if (action.status === "rejected") return { status: "rejected" as const, actionId };
    return { status: "pending" as const, actionId };
  }),
  submitReceipt: publicProcedure.input(envelopeInput.extend({ actionId: z.number().int().positive(), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/), outcome: z.enum(["completed", "failed", "blocked"]), commitHash: z.string().regex(/^[a-f0-9]{7,64}$/).optional(), errorCategory: z.enum(["policy", "git", "network", "secret_risk", "approval", "unknown"]).optional() }).strict()).mutation(async ({ input }) => {
    const { actionId, payloadDigest, outcome, commitHash, errorCategory, ...envelope } = input;
    const receipt = { actionId, payloadDigest, outcome, commitHash: commitHash ?? null, errorCategory: errorCategory ?? null, occurredAt: new Date().toISOString() };
    const device = await authenticateCompanion("/companion/submit-receipt", envelope, receipt);
    if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "Companion authentication or request signature failed." });
    const saved = await saveExecutionReceipt({ actionId, receipt: JSON.stringify(receipt) });
    if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "Action receipt could not be matched." });
    return { success: true };
  }),
});
