type RepositoryRow = { id: number; name: string; defaultBranch: string };
type PolicyRow = { repositoryId: number; revision: number; protectedBranches: string; updatedAt: Date };
type ActionRow = { repositoryId: number; status: "pending" | "approved" | "rejected"; expiresAt: Date | null; reviewedAt: Date | null; policyRevision: number; kind: "commit" | "push"; riskLevel: "low" | "medium" | "high" };
type SnapshotRow = { companionDeviceId: number; repositoryId: number; policyRevision: number; policyDigest: string; expiresAt: Date; confirmedAt: Date; acknowledgedAt: Date | null };
type DeviceRow = { id: number; label: string; status: "active" | "revoked"; lastSeenAt: Date | null };
type StatusReceiptRow = { companionDeviceId: number; repositoryId: number; policyRevision: number; policyDigest: string; branch: string; safetyStatus: "safe" | "blocked"; safetyReasons: string; changedFiles: number; eligibleFiles: number; companionVersion: string; observedAt: Date; receivedAt: Date };

export function deriveMonitoringSnapshot(input: { repositories: RepositoryRow[]; policies: PolicyRow[]; queuedActions: ActionRow[]; policySnapshots: SnapshotRow[]; statusReceipts?: StatusReceiptRow[]; devices: DeviceRow[] }, now = new Date()) {
  const nowMs = now.getTime();
  const repositories = input.repositories.map(repository => {
    const policy = input.policies.find(item => item.repositoryId === repository.id) ?? null;
    const actions = input.queuedActions.filter(action => action.repositoryId === repository.id);
    const snapshots = input.policySnapshots.filter(snapshot => snapshot.repositoryId === repository.id);
    const statuses = (input.statusReceipts ?? []).filter(status => status.repositoryId === repository.id);
    const activeDevices = input.devices.filter(device => device.status === "active");
    const acknowledgedSnapshots = snapshots.filter(snapshot => snapshot.acknowledgedAt);
    const unconfirmedSnapshots = snapshots.filter(snapshot => !snapshot.acknowledgedAt);
    const currentSnapshots = policy ? acknowledgedSnapshots.filter(snapshot => snapshot.policyRevision === policy.revision && snapshot.expiresAt.getTime() > nowMs) : [];
    const snapshotState = !policy ? "missing_policy" as const : currentSnapshots.length ? "current" as const : unconfirmedSnapshots.length ? "unconfirmed" as const : snapshots.length ? "stale" as const : "unseen" as const;
    const latestSnapshot = acknowledgedSnapshots.slice().sort((left, right) => (right.acknowledgedAt?.getTime() ?? 0) - (left.acknowledgedAt?.getTime() ?? 0))[0] ?? null;
    const deviceSync = activeDevices.map(device => {
      const latestForDevice = acknowledgedSnapshots.filter(snapshot => snapshot.companionDeviceId === device.id).sort((left, right) => (right.acknowledgedAt?.getTime() ?? 0) - (left.acknowledgedAt?.getTime() ?? 0))[0] ?? null;
      const issuedForDevice = unconfirmedSnapshots.filter(snapshot => snapshot.companionDeviceId === device.id).sort((left, right) => right.confirmedAt.getTime() - left.confirmedAt.getTime())[0] ?? null;
      const state = latestForDevice && policy && latestForDevice.policyRevision === policy.revision && latestForDevice.expiresAt.getTime() > nowMs ? "current" as const : issuedForDevice ? "unconfirmed" as const : latestForDevice ? "stale" as const : "unseen" as const;
      const latestStatus = statuses.filter(status => status.companionDeviceId === device.id).sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0] ?? null;
      const freshStatus = Boolean(latestStatus && policy && latestForDevice?.acknowledgedAt && latestForDevice.expiresAt.getTime() > nowMs && latestStatus.policyRevision === policy.revision && latestStatus.policyDigest === latestForDevice.policyDigest && latestStatus.observedAt.getTime() >= nowMs - 15 * 60 * 1000);
      const localStatus: "safe" | "blocked" | "unknown" = freshStatus && latestStatus ? latestStatus.safetyStatus : "unknown";
      return { deviceId: device.id, label: device.label, state, lastConfirmedAt: latestForDevice?.acknowledgedAt ?? null, localStatus, lastStatusAt: latestStatus?.observedAt ?? null, branch: latestStatus?.branch ?? null, cliVersion: latestStatus?.companionVersion ?? null, changedFiles: latestStatus?.changedFiles ?? null, eligibleFiles: latestStatus?.eligibleFiles ?? null, safetyReasons: latestStatus ? JSON.parse(latestStatus.safetyReasons) as string[] : [] };
    });
    const pending = actions.filter(action => action.status === "pending" && (!action.expiresAt || action.expiresAt.getTime() > nowMs));
    const expired = actions.filter(action => action.status === "pending" && action.expiresAt && action.expiresAt.getTime() <= nowMs);
    return {
      repositoryId: repository.id,
      repositoryName: repository.name,
      defaultBranch: repository.defaultBranch,
      policyRevision: policy?.revision ?? null,
      policyUpdatedAt: policy?.updatedAt ?? null,
      protectedBranches: policy ? JSON.parse(policy.protectedBranches) as string[] : [],
      approvals: { pending: pending.length, approved: actions.filter(action => action.status === "approved").length, rejected: actions.filter(action => action.status === "rejected").length, expired: expired.length },
      snapshot: { state: snapshotState, currentDevices: new Set(currentSnapshots.map(snapshot => snapshot.companionDeviceId)).size, activeDevices: activeDevices.length, lastConfirmedAt: latestSnapshot?.acknowledgedAt ?? null, expiresAt: latestSnapshot?.expiresAt ?? null, deviceSync },
    };
  });
  return {
    repositories,
    summary: {
      pendingApprovals: repositories.reduce((sum, repository) => sum + repository.approvals.pending, 0),
      expiredActions: repositories.reduce((sum, repository) => sum + repository.approvals.expired, 0),
      currentSnapshots: repositories.filter(repository => repository.snapshot.state === "current").length,
      staleOrUnseenSnapshots: repositories.filter(repository => repository.snapshot.state === "stale" || repository.snapshot.state === "unseen").length,
      freshLocalStatuses: repositories.reduce((sum, repository) => sum + repository.snapshot.deviceSync.filter(device => device.localStatus !== "unknown").length, 0),
    },
  };
}
