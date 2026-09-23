"use node";
/** GuardAsli — پردازش صف jobs: payment_verify، build، auto_backup. */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { createHash, randomBytes, createCipheriv } from "node:crypto";

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
          await ctx.runMutation(internal.infra.jobFinish, {
            jobId: job.id as never,
            success: true,
          });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else if (job.kind === "build" && job.payload) {
          const p = job.payload as { buildId: string; platform: string };
          await ctx.runMutation(internal.apps.buildMark, {
            buildId: p.buildId as never,
            status: "success",
          });
          await ctx.runMutation(internal.infra.jobFinish, {
            jobId: job.id as never,
            success: true,
          });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else if (job.kind === "auto_backup") {
          await ctx.runAction(internal.workerActions.runAutoBackup, {});
          await ctx.runMutation(internal.infra.jobFinish, {
            jobId: job.id as never,
            success: true,
          });
          results.push({ id: String(job.id), kind: job.kind, ok: true });
        } else if (job.kind === "bot_command" && job.payload) {
          const p = job.payload as {
            botConfigId: string;
            chatId: string;
            text: string;
            telegramUserId: number | null;
          };
          const botRes = (await ctx.runAction(internal.botCommands.handleBotCommand, {
            botConfigId: p.botConfigId as never,
            chatId: p.chatId,
            text: p.text,
            telegramUserId: p.telegramUserId ?? null,
          })) as { ok: boolean; reason?: string };
          await ctx.runMutation(internal.infra.jobFinish, {
            jobId: job.id as never,
            success: botRes.ok === true,
            error: botRes.ok === true ? undefined : botRes.reason,
          });
          results.push({ id: String(job.id), kind: job.kind, ok: botRes.ok === true });
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

/**
 * بکاپ خودکار: snapshot متادیتا (بدون password/token خام) → AES-GCM → storage.
 */
export const runAutoBackup = internalAction({
  args: {},
  handler: async (ctx) => {
    const snapshot = {
      product: "GuardAsli",
      developer: "AsliCode",
      release: "is0.0.1",
      kind: "auto_metadata",
      at: new Date().toISOString(),
      note: "No raw secrets; restore needs live MASTER + DB",
    };
    const plain = Buffer.from(JSON.stringify(snapshot), "utf8");
    const master = process.env.GUARDASLI_MASTER_SECRET;
    if (!master || master.length < 16) {
      throw new Error("BACKUP_SKIP: MASTER missing");
    }
    const key = createHash("sha256").update(master, "utf8").digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([
      Buffer.from("GA1"),
      iv,
      tag,
      ct,
    ]);
    const checksum = createHash("sha256").update(blob).digest("hex");

    const uploadUrl = await ctx.storage.generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) throw new Error(`BACKUP_UPLOAD_FAILED: ${res.status}`);
    const { storageId } = (await res.json()) as { storageId: string };

    await ctx.runMutation(internal.backupAuto.recordAutoBackup, {
      storageId: storageId as never,
      checksum,
      scope: "system",
    });
    return { storageId, checksum, bytes: blob.length };
  },
});

type WorkerResult = {
  processed: number;
  results: Array<{ id: string; kind: string; ok: boolean }>;
};

export const runWorkerOnce = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<WorkerResult> => {
    const who = await ctx.runQuery(api.auth.whoami, { token: args.token });
    if (who.role !== "super_admin") throw new Error("FORBIDDEN: فقط Super Admin");
    return await ctx.runAction(internal.workerActions.processDueJobs, { limit: 20 });
  },
});
