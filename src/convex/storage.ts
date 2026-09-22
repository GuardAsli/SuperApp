/** GuardAsli — آپلود رسید و دارایی‌ها. */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireActor } from "./auth";

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.token);
    return await ctx.storage.generateUploadUrl();
  },
});
