import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateCompanion: vi.fn(), canonicalJson: vi.fn((value: unknown) => JSON.stringify(value)), sha256: vi.fn(() => "f".repeat(64)), policySnapshotPayload: vi.fn(),
  acknowledgeCompanionPolicySnapshot: vi.fn(), createCompanionDevice: vi.fn(), createCompanionPairing: vi.fn(), consumeCompanionPairing: vi.fn(), getCompanionActionForDevice: vi.fn(), getCompanionPolicy: vi.fn(), getCurrentAcknowledgedCompanionPolicySnapshot: vi.fn(), recordCompanionDeviceEvent: vi.fn(), recordCompanionPolicySnapshot: vi.fn(), recordCompanionStatusReceipt: vi.fn(), revokeCompanionDevice: vi.fn(), saveExecutionReceipt: vi.fn(),
  createQueuedAction: vi.fn(), writeActivity: vi.fn(),
}));

vi.mock("./companionDb", () => mocks);
vi.mock("./companionProtocol", () => ({ authenticateCompanion: mocks.authenticateCompanion, canonicalJson: mocks.canonicalJson, sha256: mocks.sha256, policySnapshotPayload: mocks.policySnapshotPayload, signPolicyDigest: vi.fn() }));
vi.mock("./db", () => ({ createQueuedAction: mocks.createQueuedAction, writeActivity: mocks.writeActivity }));

import { companionRouter } from "./routers/companion";

const digest = "a".repeat(64);
const envelope = { deviceId: "device-status-1234", token: "t".repeat(40), nonce: "nonce-status-1234567890123456", issuedAt: Date.now(), signature: "s".repeat(40) };
const status = { repositoryId: 7, policyRevision: 3, policyDigest: digest, branch: "feature/local", safetyStatus: "safe" as const, safetyReasons: [], changedFiles: 2, eligibleFiles: 2, companionVersion: "1.0.0", observedAt: "2026-08-24T09:00:00.000Z" };
const policyData = { repository: { id: 7, defaultBranch: "main" }, policy: { revision: 3, protectedBranches: "[]", debounceSeconds: 10, commitApprovalMode: "review", pushApprovalMode: "review", ignoreRules: "[]", secretRiskMode: "block" }, approvalRule: null };

describe("signed companion status route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticateCompanion.mockResolvedValue({ id: 44, userId: 12 });
    mocks.getCompanionPolicy.mockResolvedValue(policyData);
    mocks.policySnapshotPayload.mockReturnValue({ policyDigest: digest, snapshot: {} });
    mocks.canonicalJson.mockImplementation((value: unknown) => JSON.stringify(value));
    mocks.sha256.mockReturnValue("f".repeat(64));
  });

  it("rejects status without a current device-specific acknowledged snapshot", async () => {
    mocks.getCurrentAcknowledgedCompanionPolicySnapshot.mockResolvedValue(null);
    const caller = companionRouter.createCaller({} as any);
    await expect(caller.submitStatus({ ...envelope, status })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.recordCompanionStatusReceipt).not.toHaveBeenCalled();
  });

  it("rejects inconsistent safety outcome metadata before persistence", async () => {
    mocks.getCurrentAcknowledgedCompanionPolicySnapshot.mockResolvedValue({ acknowledgedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    const caller = companionRouter.createCaller({} as any);
    await expect(caller.submitStatus({ ...envelope, status: { ...status, safetyReasons: ["protected_branch"] } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.recordCompanionStatusReceipt).not.toHaveBeenCalled();
  });

  it("persists only the strict status schema after authentication, current-policy matching, and acknowledgement", async () => {
    mocks.getCurrentAcknowledgedCompanionPolicySnapshot.mockResolvedValue({ acknowledgedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    mocks.recordCompanionStatusReceipt.mockResolvedValue(91);
    const caller = companionRouter.createCaller({} as any);
    await expect(caller.submitStatus({ ...envelope, status })).resolves.toMatchObject({ receiptId: 91 });
    expect(mocks.recordCompanionStatusReceipt).toHaveBeenCalledWith(expect.objectContaining({ companionDeviceId: 44, repositoryId: 7, branch: "feature/local", safetyReasons: "[]", payloadDigest: "f".repeat(64) }));
  });

  it("revokes only an owned active device and records the controlled lifecycle reason", async () => {
    mocks.revokeCompanionDevice.mockResolvedValue({ id: 44, revokedAt: new Date() }); mocks.recordCompanionDeviceEvent.mockResolvedValue(true);
    const caller = companionRouter.createCaller({ user: { id: 12 } } as any);
    await expect(caller.revokeDevice({ companionDeviceId: 44, reason: "lost_or_stolen" })).resolves.toMatchObject({ deviceId: 44, status: "revoked" });
    expect(mocks.revokeCompanionDevice).toHaveBeenCalledWith({ userId: 12, companionDeviceId: 44 });
    expect(mocks.recordCompanionDeviceEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "revoked", reason: "lost_or_stolen" }));
  });

  it("revokes the old credential before producing a one-time replacement pairing code", async () => {
    mocks.revokeCompanionDevice.mockResolvedValue({ id: 44, label: "Laptop", revokedAt: new Date() }); mocks.createCompanionPairing.mockResolvedValue(71); mocks.recordCompanionDeviceEvent.mockResolvedValue(true);
    const caller = companionRouter.createCaller({ user: { id: 12 } } as any);
    await expect(caller.rotateDevice({ companionDeviceId: 44, replacementLabel: "Laptop replacement" })).resolves.toMatchObject({ pairingId: 71, replacedDeviceId: 44, pairingCode: expect.any(String) });
    expect(mocks.recordCompanionDeviceEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "rotation_started", reason: "credential_rotation", replacementLabel: "Laptop replacement" }));
  });
});
