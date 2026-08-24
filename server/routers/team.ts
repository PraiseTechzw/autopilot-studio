import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { addWorkspaceMembership, createTeamWorkspace, finalizeQueuedAction, getActionApprovalContext, getTeamWorkflowSnapshot, getWorkspaceManager, getWorkspaceMembership, recordApprovalDecision, saveRepositoryApprovalRule } from "../companionDb";
import { getRepositoryForUser, writeActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const teamRouter = router({
  snapshot: protectedProcedure.query(({ ctx }) => getTeamWorkflowSnapshot(ctx.user.id)),
  createWorkspace: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const workspaceId = await createTeamWorkspace({ ownerId: ctx.user.id, name: input.name });
    if (!workspaceId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Workspace could not be created." });
    return { workspaceId };
  }),
  setMember: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(["admin", "reviewer", "member"]) })).mutation(async ({ ctx, input }) => {
    if (!await getWorkspaceManager(input.workspaceId, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Only workspace owners and administrators can manage members." });
    const saved = await addWorkspaceMembership(input);
    if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Membership could not be saved." });
    return { success: true };
  }),
  saveRule: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive(), workspaceId: z.number().int().positive(), commitRequiresApproval: z.boolean(), pushRequiresApproval: z.boolean(), approvalQuorum: z.number().int().min(1).max(5), allowSelfApproval: z.boolean(), actionExpiryMinutes: z.number().int().min(5).max(1440) })).mutation(async ({ ctx, input }) => {
    const repository = await getRepositoryForUser(ctx.user.id, input.repositoryId);
    if (!repository) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
    if (!await getWorkspaceManager(input.workspaceId, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Only workspace owners and administrators can change approval rules." });
    const saved = await saveRepositoryApprovalRule(input);
    if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Approval rule could not be saved." });
    await writeActivity({ userId: ctx.user.id, repositoryId: input.repositoryId, type: "queued", status: "info", title: "Team approval rule updated", summary: `Quorum ${input.approvalQuorum}; self approval ${input.allowSelfApproval ? "allowed" : "disabled"}.` });
    return { success: true };
  }),
  decide: protectedProcedure.input(z.object({ actionId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const context = await getActionApprovalContext(input.actionId);
    if (!context || !context.rule || context.action.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Pending action with an approval rule was not found." });
    if (context.action.expiresAt && context.action.expiresAt.getTime() < Date.now()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This action has expired and requires a fresh companion submission." });
    const membership = await getWorkspaceMembership(context.rule.workspaceId, ctx.user.id);
    if (!membership || !["owner", "admin", "reviewer"].includes(membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only eligible workspace reviewers can decide this action." });
    if (!context.rule.allowSelfApproval && context.action.actorUserId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "This repository rule requires a separate reviewer." });
    const recorded = await recordApprovalDecision({ queuedActionId: input.actionId, reviewerUserId: ctx.user.id, decision: input.decision, note: input.note });
    if (!recorded) throw new TRPCError({ code: "CONFLICT", message: "You have already reviewed this action." });
    if (input.decision === "rejected") {
      await finalizeQueuedAction({ actionId: input.actionId, status: "rejected", note: input.note });
      return { status: "rejected" as const, approvals: 0, quorum: context.rule.approvalQuorum };
    }
    const approvals = context.decisions.filter(decision => decision.decision === "approved").length + 1;
    if (approvals >= context.rule.approvalQuorum) await finalizeQueuedAction({ actionId: input.actionId, status: "approved", note: input.note });
    return { status: approvals >= context.rule.approvalQuorum ? "approved" as const : "pending" as const, approvals, quorum: context.rule.approvalQuorum };
  }),
});
