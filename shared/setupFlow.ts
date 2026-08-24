export type OAuthNotice = "authorizing" | "connected" | "cancelled" | "rejected" | "expired" | "error" | null;

export function deriveOAuthFeedback(notice: OAuthNotice, connectionStatus?: string | null): Exclude<OAuthNotice, null> | null {
  if (notice) return notice;
  if (connectionStatus === "connected") return "connected";
  if (connectionStatus === "expired" || connectionStatus === "revoked") return "expired";
  if (connectionStatus === "attention") return "error";
  return null;
}

export function deriveSetupMilestones(input: { connected: boolean; selectedRepositories: number; pairedDevices: number; currentSnapshots: number; freshLocalStatuses: number }) {
  return {
    githubConnected: input.connected,
    repositoryScopeReady: input.selectedRepositories > 0,
    companionPaired: input.pairedDevices > 0,
    policySyncCurrent: input.currentSnapshots > 0,
    localStatusCurrent: input.freshLocalStatuses > 0,
  };
}
