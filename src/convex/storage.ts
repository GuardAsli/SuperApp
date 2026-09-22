/** GuardAsli — آپلود با محدودیت نوع و ثبت audit. */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./auth";

/** حداکثر حجم توصیه UI/مستندات؛ Convex خودش سقف دارد — کلاینت باید رعایت کند. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB
export const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const generateUploadUrl = mutation({
  args: {
    token: v.string(),
    purpose: v.optional(v.string()),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (args.sizeBytes !== undefined && args.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`VALIDATION_ERROR: حداکثر حجم آپلود ${MAX_UPLOAD_BYTES} بایت است`);
    }
    if (args.contentType) {
      const ok = (ALLOWED_RECEIPT_TYPES as readonly string[]).includes(args.contentType);
      if (!ok) {
        throw new Error("VALIDATION_ERROR: فقط JPEG/PNG/WebP/PDF مجاز است");
      }
    }
    const url = await ctx.storage.generateUploadUrl();
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "storage.upload_url",
      entityType: "_storage",
      metadata: {
        purpose: args.purpose ?? "general",
        contentType: args.contentType,
        sizeBytes: args.sizeBytes,
      },
    });
    return {
      uploadUrl: url,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedTypes: [...ALLOWED_RECEIPT_TYPES],
    };
  },
});
