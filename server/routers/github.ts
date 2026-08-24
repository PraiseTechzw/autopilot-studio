import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createGitHubAuthorization } from "../githubAuth";
import { getGitHubConnectionSummary } from "../companionDb";
import { getGitHubRepositorySelections, setSelectedGitHubRepositories, syncGitHubRepositoryCatalog } from "../githubRepositories";
import { protectedProcedure, router } from "../_core/trpc";

export const githubRouter = router({
  connection: protectedProcedure.query(({ ctx }) => getGitHubConnectionSummary(ctx.user.id)),
  repositories: protectedProcedure.query(({ ctx }) => getGitHubRepositorySelections(ctx.user.id)),
  refreshRepositories: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await syncGitHubRepositoryCatalog(ctx.user.id);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "GitHub repository metadata could not be refreshed." });
    }
  }),
  setSelectedRepositories: protectedProcedure.input(z.object({ repositoryIds: z.array(z.string().trim().min(1).max(80)).max(100) })).mutation(async ({ ctx, input }) => {
    try {
      return await setSelectedGitHubRepositories(ctx.user.id, input.repositoryIds);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "GitHub repository selections could not be saved." });
    }
  }),
  beginAuthorization: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await createGitHubAuthorization(ctx.user.id, ctx.req);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "GitHub authorization could not start." });
    }
  }),
});
