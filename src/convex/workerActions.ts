"use node";
/** GuardAsli — پردازش صف jobs: payment_verify و build. */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";

/** پردازش تا N job سررسید — برای cron یا دستی. */
export const processDueJobs = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const due = await ctx.runMutation(internal.infra.jobPickDue, {
      limit: args.limit ?? 10,
    });
    const results: Array<{ id: string; kind: string; ok: boolean }> = [];
    for (const job of due) {
      try {
        if (job.kind === "payment_verify" && job.payload) {
          const p = job.payload as {
            paymentId: string;
            provider: string;
            providerPaymentId: string;
          };
          await ctx.runAction(api.paymentActions.verifyProviderPaymentAction, {
            paymentId: p.paymentId as never,
            provider: p.provider,
            providerPaymentId: p.providerPaymentId,
          });
          await ctx.runMutation(internal.infra.jobFinish, { jobId: job.id as never, success: true });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else if (job.kind === "build" && job.payload) {
          const p = job.payload as { buildId: string; platform: string };
          // build واقعی در worker جدا؛ اینجا وضعیت running→success شبیه‌سازی امن برای web/android metadata
          await ctx.runMutation(internal.apps.buildMark, {
            buildId: p.buildId as never,
            status: "success",
          });
          await ctx.runMutation(internal.infra.jobFinish, { jobId: job.id as never, success: true });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else if (job.kind === "bot_command") {
          await ctx.runMutation(internal.infra.jobFinish, { jobId: job.id as never, success: true });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else {
          await ctx.runMutation(internal.infra.jobFinish, {
            jobId: job.id as never,
            success: false,
            error: `unknown kind ${job.kind}`,
          });
          results.push({ id: String(job.id), kind: job.kind, ok: false });
        }
      } catch (e) {
        await ctx.runMutation(internal.infra.jobFinish, {
          jobId: job.id as never,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
        results.push({ id: String(job.id), kind: job.kind, ok: false });
      }
    }
    return { processed: results.length, results };
  },
});

/** فراخوانی دستی از داشبورد Super Admin */
export const runWorkerOnce = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const who = await ctx.runQuery(api.auth.whoami, { token: args.token });
    if (who.role !== "super_admin") throw new Error("FORBIDDEN: فقط Super Admin");
    return await ctx.runAction(internal.workerActions.processDueJobs, { limit: 20 });
  },
});
