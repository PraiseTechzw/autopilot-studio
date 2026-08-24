import { describe, expect, it } from "vitest";
import { deriveOAuthFeedback, deriveSetupMilestones } from "../shared/setupFlow";

describe("guided setup and OAuth feedback", () => {
  it("derives the most relevant OAuth feedback state from callback and connection evidence", () => {
    expect(deriveOAuthFeedback("authorizing", "connected")).toBe("authorizing");
    expect(deriveOAuthFeedback(null, "connected")).toBe("connected");
    expect(deriveOAuthFeedback(null, "expired")).toBe("expired");
    expect(deriveOAuthFeedback(null, "attention")).toBe("error");
    expect(deriveOAuthFeedback("cancelled", null)).toBe("cancelled");
    expect(deriveOAuthFeedback("rejected", null)).toBe("rejected");
  });

  it("keeps setup incomplete until each observable safety milestone is met", () => {
    expect(deriveSetupMilestones({ connected: true, selectedRepositories: 1, pairedDevices: 0, currentSnapshots: 0 })).toEqual({ githubConnected: true, repositoryScopeReady: true, companionPaired: false, policySyncCurrent: false });
    expect(deriveSetupMilestones({ connected: true, selectedRepositories: 2, pairedDevices: 1, currentSnapshots: 1 }).policySyncCurrent).toBe(true);
  });
});
