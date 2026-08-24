import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  createRecoveryAction,
  createRepositoryForUser,
  createQueuedAction,
  getNotificationPreferences,
  getMonitoringSnapshot,
  getRepositoryForUser,
  getStudioSnapshot,
  saveAutomationPolicy,
  saveExtensionPreference,
  saveNotificationPreferences,
  reviewQueuedAction,
  writeActivity,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { companionRouter } from "./routers/companion";
import { githubRouter } from "./routers/github";
import { teamRouter } from "./routers/team";

const repositoryInput = z.object({
  name: z.string().trim().min(2).max(160),
  origin: z.string().trim().min(3).max(500),
  defaultBranch: z.string().trim().min(1).max(120).default("main"),
});

const policyInput = z.object({
  repositoryId: z.number().int().positive(),
  protectedBranches: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  debounceSeconds: z.number().int().min(5).max(3600),
  commitApprovalMode: z.enum(["automatic", "review", "manual"]),
  pushApprovalMode: z.enum(["automatic", "review", "manual"]),
  ignoreRules: z.array(z.string().trim().min(1).max(300)).max(100),
  secretRiskMode: z.enum(["block", "review", "notify"]),
});

const extensionInput = z.object({
  extensionKey: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(160),
  category: z.enum(["ide", "git_host", "notification", "team_workflow"]),
  description: z.string().trim().min(3).max(2000),
  enabled: z.boolean(),
  configuration: z.record(z.string(), z.unknown()).default({}),
  permissionScopes: z.array(z.string().trim().min(1).max(160)).max(20),
});

const notificationInput = z.object({
  automationPaused: z.boolean(),
  secretRiskBlocked: z.boolean(),
  pushFailed: z.boolean(),
  extensionNeedsAttention: z.boolean(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  companion: companionRouter,
  github: githubRouter,
  team: teamRouter,
  studio: router({
    dashboard: protectedProcedure.query(({ ctx }) => getStudioSnapshot(ctx.user.id)),
    monitoring: protectedProcedure.query(({ ctx }) => getMonitoringSnapshot(ctx.user.id)),
    connectRepository: protectedProcedure.input(repositoryInput).mutation(async ({ ctx, input }) => {
      const repositoryId = await createRepositoryForUser({ userId: ctx.user.id, ...input });
      if (!repositoryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repository could not be saved." });
      await writeActivity({
        userId: ctx.user.id,
        repositoryId,
        type: "paused",
        status: "info",
        title: "Repository connected in paused mode",
        summary: "Autopilot Studio saved repository metadata only. Local automation remains off until a companion applies a reviewed policy.",
      });
      return { repositoryId };
    }),
    updatePolicy: protectedProcedure.input(policyInput).mutation(async ({ ctx, input }) => {
      const repository = await getRepositoryForUser(ctx.user.id, input.repositoryId);
      if (!repository) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      const saved = await saveAutomationPolicy({
        repositoryId: input.repositoryId,
        protectedBranches: JSON.stringify(input.protectedBranches),
        debounceSeconds: input.debounceSeconds,
        commitApprovalMode: input.commitApprovalMode,
        pushApprovalMode: input.pushApprovalMode,
        ignoreRules: JSON.stringify(input.ignoreRules),
        secretRiskMode: input.secretRiskMode,
      });
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Policy could not be saved." });
      await writeActivity({
        userId: ctx.user.id,
        repositoryId: input.repositoryId,
        type: "queued",
        status: "info",
        title: "Automation policy updated",
        summary: `Commit mode: ${input.commitApprovalMode}. Push mode: ${input.pushApprovalMode}. Secret handling: ${input.secretRiskMode}.`,
      });
      return { success: true };
    }),
    setExtension: protectedProcedure.input(extensionInput).mutation(async ({ ctx, input }) => {
      const saved = await saveExtensionPreference({
        userId: ctx.user.id,
        extensionKey: input.extensionKey,
        name: input.name,
        category: input.category,
        description: input.description,
        enabled: input.enabled,
        configuration: JSON.stringify(input.configuration),
        permissionScopes: JSON.stringify(input.permissionScopes),
      });
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Extension preference could not be saved." });
      await writeActivity({
        userId: ctx.user.id,
        type: "extension",
        status: input.enabled ? "success" : "info",
        title: `${input.enabled ? "Enabled" : "Disabled"} ${input.name}`,
        summary: "Extension state changed in the web control plane. Local and provider permissions still require explicit companion consent.",
      });
      return { success: true };
    }),
    requestRecovery: protectedProcedure
      .input(z.object({ repositoryId: z.number().int().positive(), type: z.enum(["undo", "revert"]), targetRef: z.string().trim().min(4).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const repository = await getRepositoryForUser(ctx.user.id, input.repositoryId);
        if (!repository) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
        const activityLogId = await writeActivity({
          userId: ctx.user.id,
          repositoryId: input.repositoryId,
          type: "recovery",
          status: "warning",
          title: `${input.type === "undo" ? "Undo" : "Revert"} requested`,
          summary: `A local companion must confirm ${input.type} for ${input.targetRef}. No remote history is rewritten by Studio.`,
        });
        const recoveryId = await createRecoveryAction({
          userId: ctx.user.id,
          repositoryId: input.repositoryId,
          activityLogId: activityLogId ?? undefined,
          type: input.type,
          targetRef: input.targetRef,
        });
        if (!recoveryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Recovery request could not be saved." });
        return { recoveryId };
      }),
    queueAction: protectedProcedure
      .input(z.object({
        repositoryId: z.number().int().positive(),
        kind: z.enum(["commit", "push"]),
        branch: z.string().trim().min(1).max(120),
        summary: z.string().trim().min(3).max(2000),
        changedFiles: z.number().int().min(0).max(100000),
        riskLevel: z.enum(["low", "medium", "high"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const repository = await getRepositoryForUser(ctx.user.id, input.repositoryId);
        if (!repository) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
        const actionId = await createQueuedAction({ userId: ctx.user.id, ...input });
        if (!actionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Action could not be queued." });
        await writeActivity({
          userId: ctx.user.id,
          repositoryId: input.repositoryId,
          type: "queued",
          status: input.riskLevel === "high" ? "warning" : "info",
          title: `${input.kind === "commit" ? "Commit" : "Push"} awaiting review`,
          summary: input.summary,
          metadata: JSON.stringify({ actionId, branch: input.branch, changedFiles: input.changedFiles, riskLevel: input.riskLevel }),
        });
        return { actionId };
      }),
    reviewAction: protectedProcedure
      .input(z.object({ actionId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), decisionNote: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const action = await reviewQueuedAction({ userId: ctx.user.id, ...input });
        if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Pending action not found." });
        await writeActivity({
          userId: ctx.user.id,
          repositoryId: action.repositoryId,
          type: input.decision === "approved" ? (action.kind === "commit" ? "committed" : "pushed") : "blocked",
          status: input.decision === "approved" ? "success" : "warning",
          title: `${action.kind === "commit" ? "Commit" : "Push"} ${input.decision}`,
          summary: input.decision === "approved"
            ? "Approval was recorded. A local companion must still verify policy before performing the Git operation."
            : "The queued action was rejected before any local Git operation was requested.",
          metadata: JSON.stringify({ actionId: action.id, branch: action.branch, decisionNote: input.decisionNote ?? null }),
        });
        return { success: true };
      }),
    updateNotifications: protectedProcedure.input(notificationInput).mutation(async ({ ctx, input }) => {
      const saved = await saveNotificationPreferences({ userId: ctx.user.id, ...input });
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Alert preferences could not be saved." });
      return { success: true };
    }),
    sendTestAlert: protectedProcedure
      .input(z.object({ category: z.enum(["automationPaused", "secretRiskBlocked", "pushFailed", "extensionNeedsAttention"]) }))
      .mutation(async ({ ctx, input }) => {
        const preferences = await getNotificationPreferences(ctx.user.id);
        if (!preferences?.[input.category]) return { delivered: false, reason: "opt_in_required" as const };
        const delivered = await notifyOwner({
          title: "Autopilot Studio test alert",
          content: `A test alert was requested for ${input.category}. Delivery occurred only because this category is enabled in Studio preferences.`,
        });
        await writeActivity({
          userId: ctx.user.id,
          type: "paused",
          status: delivered ? "success" : "warning",
          title: "Test alert processed",
          summary: delivered ? `Opt-in test alert delivered for ${input.category}.` : `Opt-in alert for ${input.category} could not be delivered.`,
        });
        return { delivered, reason: delivered ? "sent" as const : "delivery_unavailable" as const };
      }),
  }),
});

export type AppRouter = typeof appRouter;
