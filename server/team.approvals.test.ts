import { beforeEach, describe, expect, it, vi } from "vitest";

const companionMocks = vi.hoisted(() => ({
  getActionApprovalContext: vi.fn(),
  getWorkspaceMembership: vi.fn(),
  recordApprovalDecision: vi.fn(),
  finalizeQueuedAction: vi.fn(),
  addWorkspaceMembership: vi.fn(),
  createTeamWorkspace: vi.fn(),
  getTeamWorkflowSnapshot: vi.fn(),
  getWorkspaceManager: vi.fn(),
  saveRepositoryApprovalRule: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({ getRepositoryForUser: vi.fn(), writeActivity: vi.fn() }));

vi.mock("./companionDb", () => companionMocks);
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), ...dbMocks }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(userId = 7): TrpcContext {
  return { user: { id: userId, openId: `user-${userId}`, email: null, name: "Studio User", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("team approval quorum", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a non-manager from changing workspace membership", async () => {
    companionMocks.getWorkspaceManager.mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).team.setMember({ workspaceId: 3, userId: 8, role: "reviewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(companionMocks.addWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("allows an administrator to manage a member but keeps a reviewer out of approval-rule management", async () => {
    companionMocks.getWorkspaceManager.mockResolvedValue({ role: "admin" });
    companionMocks.addWorkspaceMembership.mockResolvedValue(true);
    await expect(appRouter.createCaller(context()).team.setMember({ workspaceId: 3, userId: 8, role: "reviewer" })).resolves.toEqual({ success: true });

    dbMocks.getRepositoryForUser.mockResolvedValue({ id: 9, userId: 7 });
    companionMocks.getWorkspaceManager.mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).team.saveRule({ repositoryId: 9, workspaceId: 3, commitRequiresApproval: true, pushRequiresApproval: true, approvalQuorum: 1, allowSelfApproval: false, actionExpiryMinutes: 60 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an owner to manage both members and repository approval rules", async () => {
    companionMocks.getWorkspaceManager.mockResolvedValue({ role: "owner" });
    companionMocks.addWorkspaceMembership.mockResolvedValue(true);
    companionMocks.saveRepositoryApprovalRule.mockResolvedValue(true);
    dbMocks.getRepositoryForUser.mockResolvedValue({ id: 9, userId: 11 });
    dbMocks.writeActivity.mockResolvedValue(1);
    await expect(appRouter.createCaller(context(11)).team.setMember({ workspaceId: 3, userId: 8, role: "member" })).resolves.toEqual({ success: true });
    await expect(appRouter.createCaller(context(11)).team.saveRule({ repositoryId: 9, workspaceId: 3, commitRequiresApproval: true, pushRequiresApproval: true, approvalQuorum: 1, allowSelfApproval: false, actionExpiryMinutes: 60 })).resolves.toEqual({ success: true });
  });

  it.each(["reviewer", "member"])("denies a %s from member and approval-rule management", async role => {
    const explicitRole = role as "reviewer" | "member";
    companionMocks.getWorkspaceManager.mockImplementation(async () => explicitRole === "reviewer" || explicitRole === "member" ? null : { role: explicitRole });
    dbMocks.getRepositoryForUser.mockResolvedValue({ id: 9, userId: 7 });
    const caller = appRouter.createCaller(context());
    await expect(caller.team.setMember({ workspaceId: 3, userId: 8, role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.team.saveRule({ repositoryId: 9, workspaceId: 3, commitRequiresApproval: true, pushRequiresApproval: true, approvalQuorum: 1, allowSelfApproval: false, actionExpiryMinutes: 60 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(companionMocks.addWorkspaceMembership).not.toHaveBeenCalled();
    expect(companionMocks.saveRepositoryApprovalRule).not.toHaveBeenCalled();
    expect(role).toMatch(/reviewer|member/);
  });

  it("allows an administrator to manage an approval rule", async () => {
    companionMocks.getWorkspaceManager.mockResolvedValue({ role: "admin" });
    companionMocks.saveRepositoryApprovalRule.mockResolvedValue(true);
    dbMocks.getRepositoryForUser.mockResolvedValue({ id: 9, userId: 7 });
    dbMocks.writeActivity.mockResolvedValue(1);
    await expect(appRouter.createCaller(context()).team.saveRule({ repositoryId: 9, workspaceId: 3, commitRequiresApproval: true, pushRequiresApproval: true, approvalQuorum: 2, allowSelfApproval: false, actionExpiryMinutes: 60 })).resolves.toEqual({ success: true });
  });

  it("keeps an action pending until the required number of distinct reviewers approve", async () => {
    companionMocks.getActionApprovalContext.mockResolvedValue({ action: { id: 22, status: "pending", actorUserId: 4, expiresAt: new Date(Date.now() + 60_000) }, rule: { workspaceId: 3, allowSelfApproval: false, approvalQuorum: 2 }, decisions: [] });
    companionMocks.getWorkspaceMembership.mockResolvedValue({ role: "reviewer" });
    companionMocks.recordApprovalDecision.mockResolvedValue(1);
    const result = await appRouter.createCaller(context()).team.decide({ actionId: 22, decision: "approved" });
    expect(result).toEqual({ status: "pending", approvals: 1, quorum: 2 });
    expect(companionMocks.finalizeQueuedAction).not.toHaveBeenCalled();
  });

  it("rejects a self-approval when the repository rule requires separation of duties", async () => {
    companionMocks.getActionApprovalContext.mockResolvedValue({ action: { id: 23, status: "pending", actorUserId: 7, expiresAt: new Date(Date.now() + 60_000) }, rule: { workspaceId: 3, allowSelfApproval: false, approvalQuorum: 1 }, decisions: [] });
    companionMocks.getWorkspaceMembership.mockResolvedValue({ role: "reviewer" });
    await expect(appRouter.createCaller(context()).team.decide({ actionId: 23, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
