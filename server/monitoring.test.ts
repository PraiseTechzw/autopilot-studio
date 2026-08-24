import { describe, expect, it } from "vitest";
import { deriveMonitoringSnapshot } from "./monitoring";

const now = new Date("2026-08-24T09:00:00.000Z");

describe("approval and policy snapshot monitoring", () => {
  it("reports pending approvals and a current signed snapshot for the active policy revision", () => {
    const snapshot = deriveMonitoringSnapshot({
      repositories: [{ id: 1, name: "acme/console", defaultBranch: "main" }],
      policies: [{ repositoryId: 1, revision: 4, protectedBranches: "[\"main\"]", updatedAt: now }],
      queuedActions: [
        { repositoryId: 1, status: "pending", expiresAt: new Date("2026-08-24T10:00:00.000Z"), reviewedAt: null, policyRevision: 4, kind: "push", riskLevel: "medium" },
        { repositoryId: 1, status: "approved", expiresAt: new Date("2026-08-24T10:00:00.000Z"), reviewedAt: now, policyRevision: 4, kind: "commit", riskLevel: "low" },
      ],
      policySnapshots: [{ companionDeviceId: 8, repositoryId: 1, policyRevision: 4, policyDigest: "a".repeat(64), expiresAt: new Date("2026-08-24T09:10:00.000Z"), confirmedAt: now, acknowledgedAt: now }],
      devices: [{ id: 8, label: "Laptop", status: "active", lastSeenAt: now }],
    }, now);

    expect(snapshot.summary).toMatchObject({ pendingApprovals: 1, currentSnapshots: 1, staleOrUnseenSnapshots: 0 });
    expect(snapshot.repositories[0]).toMatchObject({ approvals: { pending: 1, approved: 1, rejected: 0, expired: 0 }, snapshot: { state: "current", currentDevices: 1, activeDevices: 1 } });
  });

  it("marks an expired or mismatched receipt as stale while keeping expired actions visible", () => {
    const snapshot = deriveMonitoringSnapshot({
      repositories: [{ id: 2, name: "acme/api", defaultBranch: "main" }],
      policies: [{ repositoryId: 2, revision: 7, protectedBranches: "[\"main\"]", updatedAt: now }],
      queuedActions: [{ repositoryId: 2, status: "pending", expiresAt: new Date("2026-08-24T08:00:00.000Z"), reviewedAt: null, policyRevision: 6, kind: "push", riskLevel: "high" }],
      policySnapshots: [{ companionDeviceId: 9, repositoryId: 2, policyRevision: 6, policyDigest: "b".repeat(64), expiresAt: new Date("2026-08-24T08:30:00.000Z"), confirmedAt: new Date("2026-08-24T08:00:00.000Z"), acknowledgedAt: new Date("2026-08-24T08:01:00.000Z") }],
      devices: [{ id: 9, label: "CI laptop", status: "active", lastSeenAt: now }],
    }, now);

    expect(snapshot.summary).toMatchObject({ pendingApprovals: 0, expiredActions: 1, currentSnapshots: 0, staleOrUnseenSnapshots: 1 });
    expect(snapshot.repositories[0]?.snapshot.state).toBe("stale");
  });

  it("reports an issued receipt as unconfirmed until the local companion acknowledges its validation", () => {
    const snapshot = deriveMonitoringSnapshot({
      repositories: [{ id: 3, name: "acme/worker", defaultBranch: "main" }],
      policies: [{ repositoryId: 3, revision: 2, protectedBranches: "[\"main\"]", updatedAt: now }],
      queuedActions: [],
      policySnapshots: [{ companionDeviceId: 10, repositoryId: 3, policyRevision: 2, policyDigest: "c".repeat(64), expiresAt: new Date("2026-08-24T09:10:00.000Z"), confirmedAt: now, acknowledgedAt: null }],
      devices: [{ id: 10, label: "Workstation", status: "active", lastSeenAt: now }],
    }, now);

    expect(snapshot.repositories[0]?.snapshot).toMatchObject({ state: "unconfirmed", deviceSync: [{ deviceId: 10, state: "unconfirmed", lastConfirmedAt: null }] });
  });

  it("keeps signed local posture separate from policy acknowledgement and expires it after fifteen minutes", () => {
    const input = {
      repositories: [{ id: 4, name: "acme/desktop", defaultBranch: "main" }],
      policies: [{ repositoryId: 4, revision: 3, protectedBranches: "[]", updatedAt: now }],
      queuedActions: [],
      policySnapshots: [{ companionDeviceId: 11, repositoryId: 4, policyRevision: 3, policyDigest: "d".repeat(64), expiresAt: new Date("2026-08-24T09:10:00.000Z"), confirmedAt: now, acknowledgedAt: now }],
      statusReceipts: [{ companionDeviceId: 11, repositoryId: 4, policyRevision: 3, policyDigest: "d".repeat(64), branch: "feature/safe", safetyStatus: "safe" as const, safetyReasons: "[]", changedFiles: 4, eligibleFiles: 3, companionVersion: "1.0.0", observedAt: new Date("2026-08-24T08:55:01.000Z"), receivedAt: now }],
      devices: [{ id: 11, label: "Local laptop", status: "active" as const, lastSeenAt: now }],
    };
    const fresh = deriveMonitoringSnapshot(input, now);
    expect(fresh.summary.freshLocalStatuses).toBe(1);
    expect(fresh.repositories[0]?.snapshot.deviceSync[0]).toMatchObject({ localStatus: "safe", branch: "feature/safe", changedFiles: 4, eligibleFiles: 3 });
    const stale = deriveMonitoringSnapshot(input, new Date("2026-08-24T09:20:00.000Z"));
    expect(stale.summary.freshLocalStatuses).toBe(0);
    expect(stale.repositories[0]?.snapshot.deviceSync[0]?.localStatus).toBe("unknown");
  });
});
