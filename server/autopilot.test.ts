import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  createQueuedAction: vi.fn(),
  createRecoveryAction: vi.fn(),
  createRepositoryForUser: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getRepositoryForUser: vi.fn(),
  getStudioSnapshot: vi.fn(),
  saveAutomationPolicy: vi.fn(),
  saveExtensionPreference: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  reviewQueuedAction: vi.fn(),
  writeActivity: vi.fn(),
}));

vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import { appRouter } from "./routers";

const mockedDb = vi.mocked(db);
const mockedNotifyOwner = vi.mocked(notifyOwner);

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "studio-user",
      name: "Studio User",
      email: "studio@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const repository = {
  id: 22,
  userId: 7,
  name: "dashboard-web",
  origin: "github.com/studio/dashboard-web",
  defaultBranch: "main",
  monitoringStatus: "paused" as const,
  safetyScore: 100,
  lastSeenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => vi.clearAllMocks());

describe("Autopilot Studio safety controls", () => {
  it("rejects an unsafe debounce setting before persisting a policy", async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.studio.updatePolicy({
        repositoryId: 22,
        protectedBranches: ["main"],
        debounceSeconds: 1,
        commitApprovalMode: "review",
        pushApprovalMode: "review",
        ignoreRules: [".env"],
        secretRiskMode: "block",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockedDb.saveAutomationPolicy).not.toHaveBeenCalled();
  });

  it("persists a policy with review-first approval and a secret block", async () => {
    mockedDb.getRepositoryForUser.mockResolvedValue(repository);
    mockedDb.saveAutomationPolicy.mockResolvedValue(true);
    mockedDb.writeActivity.mockResolvedValue(90);
    const caller = appRouter.createCaller(context());

    await expect(
      caller.studio.updatePolicy({
        repositoryId: 22,
        protectedBranches: ["main", "release"],
        debounceSeconds: 20,
        commitApprovalMode: "review",
        pushApprovalMode: "review",
        ignoreRules: [".env", "*.pem"],
        secretRiskMode: "block",
      })
    ).resolves.toEqual({ success: true });

    expect(mockedDb.saveAutomationPolicy).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: 22,
      commitApprovalMode: "review",
      pushApprovalMode: "review",
      secretRiskMode: "block",
      protectedBranches: JSON.stringify(["main", "release"]),
    }));
  });

  it("records an extension preference with only its declared scopes", async () => {
    mockedDb.saveExtensionPreference.mockResolvedValue(true);
    mockedDb.writeActivity.mockResolvedValue(91);
    const caller = appRouter.createCaller(context());

    await caller.studio.setExtension({
      extensionKey: "vscode-companion",
      name: "VS Code companion",
      category: "ide",
      description: "View local queue state.",
      enabled: true,
      configuration: { compactMode: true },
      permissionScopes: ["Read workspace metadata"],
    });

    expect(mockedDb.saveExtensionPreference).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      permissionScopes: JSON.stringify(["Read workspace metadata"]),
      configuration: JSON.stringify({ compactMode: true }),
    }));
  });

  it("records a Git-native recovery request without performing a remote rewrite", async () => {
    mockedDb.getRepositoryForUser.mockResolvedValue(repository);
    mockedDb.writeActivity.mockResolvedValue(92);
    mockedDb.createRecoveryAction.mockResolvedValue(44);
    const caller = appRouter.createCaller(context());

    await expect(caller.studio.requestRecovery({ repositoryId: 22, type: "revert", targetRef: "HEAD" })).resolves.toEqual({ recoveryId: 44 });

    expect(mockedDb.createRecoveryAction).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: 22,
      type: "revert",
      targetRef: "HEAD",
    }));
  });

  it("records approval for a pending action and leaves local Git execution to the companion", async () => {
    mockedDb.reviewQueuedAction.mockResolvedValue({
      id: 51,
      userId: 7,
      repositoryId: 22,
      kind: "push",
      branch: "develop",
      summary: "Push reviewed work",
      changedFiles: 4,
      riskLevel: "low",
      status: "pending",
      decisionNote: null,
      createdAt: new Date(),
      reviewedAt: null,
    });
    mockedDb.writeActivity.mockResolvedValue(94);
    const caller = appRouter.createCaller(context());

    await expect(caller.studio.reviewAction({ actionId: 51, decision: "approved" })).resolves.toEqual({ success: true });

    expect(mockedDb.reviewQueuedAction).toHaveBeenCalledWith({ userId: 7, actionId: 51, decision: "approved" });
    expect(mockedDb.writeActivity).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: 22,
      type: "pushed",
      status: "success",
    }));
  });

  it("does not deliver an alert until the specific category is opted in", async () => {
    mockedDb.getNotificationPreferences.mockResolvedValue({
      id: 1,
      userId: 7,
      automationPaused: false,
      secretRiskBlocked: false,
      pushFailed: false,
      extensionNeedsAttention: false,
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.studio.sendTestAlert({ category: "pushFailed" })).resolves.toEqual({ delivered: false, reason: "opt_in_required" });
    expect(mockedNotifyOwner).not.toHaveBeenCalled();
    expect(mockedDb.writeActivity).not.toHaveBeenCalled();
  });

  it("delivers a test alert only after the matching category is enabled", async () => {
    mockedDb.getNotificationPreferences.mockResolvedValue({
      id: 1,
      userId: 7,
      automationPaused: false,
      secretRiskBlocked: false,
      pushFailed: true,
      extensionNeedsAttention: false,
      updatedAt: new Date(),
    });
    mockedNotifyOwner.mockResolvedValue(true);
    mockedDb.writeActivity.mockResolvedValue(93);
    const caller = appRouter.createCaller(context());

    await expect(caller.studio.sendTestAlert({ category: "pushFailed" })).resolves.toEqual({ delivered: true, reason: "sent" });
    expect(mockedNotifyOwner).toHaveBeenCalledTimes(1);
  });
});
