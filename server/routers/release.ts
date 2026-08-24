import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getCompanionReleaseStatus } from "../releaseStatus";

export const releaseRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getCompanionReleaseStatus(ctx.user.id);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "GitHub release status is temporarily unavailable." });
    }
  }),
});
