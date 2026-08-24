import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveCompanionDevice: vi.fn(),
  rememberCompanionNonce: vi.fn(),
  touchCompanionDevice: vi.fn(),
}));

vi.mock("./companionDb", () => mocks);

import { authenticateCompanion, canonicalJson, createRequestSigningPayload, policySnapshotPayload } from "./companionProtocol";

describe("companion protocol", () => {
  beforeEach(() => vi.resetAllMocks());

  it("accepts a verified signed request once and rejects a replayed nonce", async () => {
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const body = { repositoryId: 12 };
    const bareEnvelope = { deviceId: "device-0123456789", nonce: "nonce-0123456789-abcdefghijkl", issuedAt: Date.now() };
    const payload = createRequestSigningPayload("/companion/policy", bareEnvelope, body);
    const signature = sign(null, Buffer.from(payload), pair.privateKey).toString("base64");
    mocks.getActiveCompanionDevice.mockResolvedValue({ id: 8, userId: 3, publicKey });
    mocks.rememberCompanionNonce.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.touchCompanionDevice.mockResolvedValue(true);

    const envelope = { ...bareEnvelope, token: "a".repeat(40), signature };
    await expect(authenticateCompanion("/companion/policy", envelope, body)).resolves.toMatchObject({ id: 8, userId: 3 });
    await expect(authenticateCompanion("/companion/policy", envelope, body)).resolves.toBeNull();
  });

  it("creates a digestable policy snapshot without source code fields", () => {
    const result = policySnapshotPayload({ revision: 2, protectedBranches: JSON.stringify(["main"]), debounceSeconds: 20, commitApprovalMode: "review", pushApprovalMode: "review", ignoreRules: JSON.stringify([".env"]), secretRiskMode: "block" }, { id: 9, defaultBranch: "main" }, null);
    expect(result.policyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.snapshot).toMatchObject({ repositoryId: 9, revision: 2, protectedBranches: ["main"], ignoreRules: [".env"] });
    expect(JSON.stringify(result.snapshot)).not.toContain("contents");
  });

  it("canonicalizes status-style metadata independently of input field order", () => {
    const left = { repositoryId: 9, branch: "feature/safe", changedFiles: 2, safetyReasons: ["protected_branch"] };
    const right = { safetyReasons: ["protected_branch"], changedFiles: 2, branch: "feature/safe", repositoryId: 9 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
  });
});
