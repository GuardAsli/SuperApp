"use node";
/** GuardAsli — اجرای فرمان‌های ربات تلگرام از worker (صف bot_command).
 *  ادمین ربات با «شناسه عددی تلگرام» شناخته می‌شود؛ اگر تنظیم نباشد،
 *  نخستین کسی که /admin می‌فرستد ادمین می‌شود (claim). */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptBotToken, encryptSecret } from "../core/aead";

const PRODUCT = "GuardAsli";
const DEVELOPER = "AsliCode";

function master(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET پیکربندی نشده است");
  }
  return s;
}

function helpText(isAdmin: boolean): string {
  const base = [
    `🛡 ${PRODUCT} Bot — Powered By ${DEVELOPER}`,
    "",
    "دستورهای عمومی:",
    "/help — همین راهنما",
    "/id — شناسه عددی تلگرام شما",
    "/me — حساب و موجودی متصل به این چت",
  ];
  if (!isAdmin) {
    return base.join("\n") + "\n\nبرای مدیریت ربات: /admin";
  }
  return (
    base.join("\n") +
    [
      "",
      "دستورهای ادمین ربات (مدیریت کامل ربات و مینی‌اپ):",
      "/admin — پنل ادمین ربات",
      "/botinfo — وضعیت پیکربندی ربات",
      "/bot on | /bot off — روشن/خاموش کردن ربات",
      "/setadmin <شناسه عددی> — تغییر ادمین ربات",
      "/token <توکن جدید> — جایگزینی توکن ربات (رمزنگاری‌شده ذخیره می‌شود)",
      "/miniapp <https://...> — تنظیم مینی‌اپ + دکمه منو",
      "/webhook <https://دامنه> — تنظیم خودکار webhook",
      "/stats — آمار کاربران ربات",
      "/broadcast <متن> — پیام به همه کاربران متصل",
    ].join("\n")
  );
}

export const handleBotCommand = internalAction({
  args: {
    botConfigId: v.id("botConfigs"),
    chatId: v.string(),
    text: v.string(),
    telegramUserId: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.runQuery(internal.telegram.botCommandContext, {
      botConfigId: args.botConfigId,
    });
    if (!cfg) return { ok: false, reason: "NO_CONFIG" };

    const masterSecret = master();
    let botToken: string | null = null;
    try {
      botToken = decryptBotToken(cfg.tokenEncrypted, masterSecret);
    } catch {
      botToken = null;
    }
    if (!botToken) return { ok: false, reason: "DECRYPT_FAILED" };

    const reply = async (text: string): Promise<void> => {
      await ctx.runAction(internal.telegramActions.sendBotReply, {
        botToken,
        chatId: args.chatId,
        text,
      });
    };

    const fromId = args.telegramUserId;
    const isAdminCall =
      cfg.adminTelegramUserId !== null && fromId !== null && fromId === cfg.adminTelegramUserId;

    const parts = args.text.trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase().replace(/@[^@\s]+$/, "");
    const rest = parts.slice(1).join(" ").trim();

    // bot خاموش → وضعیت و روشن‌کردن مجدد توسط ادمین کار می‌کند؛ بقیه بی‌اثر
    if (
      !cfg.enabled &&
      !["/botinfo", "/help", "/start", "/bot"].includes(cmd)
    ) {
      await reply("⏸ ربات خاموش است — از /botinfo برای وضعیت استفاده کنید.");
      return { ok: true };
    }

    // ————— فرمان‌های عمومی —————
    if (cmd === "/start" || cmd === "/help") {
      await reply(helpText(isAdminCall));
      return { ok: true };
    }
    if (cmd === "/id") {
      await reply(
        `شناسه عددی تلگرام شما:\n${fromId ?? args.chatId}\n\nاین عدد را به ادمین بدهید تا شما را متصل کند.`,
      );
      return { ok: true };
    }
    if (cmd === "/me") {
      const w = await ctx.runQuery(internal.telegram.botWalletInternal, {
        botConfigId: args.botConfigId,
        telegramUserId: fromId ?? Number(args.chatId),
      });
      if (!("linked" in w) || !w.linked) {
        await reply(
          "حسابی به این چت متصل نیست.\n\nاتصال: در پنل وب بخش ربات، «شناسه عددی» شما با نام کاربری‌تان پیوند می‌خورد (شناسه: /id).",
        );
        return { ok: true };
      }
      await reply(
        `👤 ${w.username} (${w.role})\n💰 موجودی: ${w.balance.toLocaleString("fa-IR")}`,
      );
      return { ok: true };
    }

    // ————— /admin: claim یا پنل ادمین —————
    if (cmd === "/admin") {
      if (cfg.adminTelegramUserId === null) {
        if (fromId === null) {
          await reply("این چت فاقد شناسه عددی معتبر است.");
          return { ok: true };
        }
        await ctx.runMutation(internal.telegram.botClaimAdminInternal, {
          botConfigId: args.botConfigId,
          telegramUserId: fromId,
        });
        await reply(
          `✅ شما ادمین این ربات شدید.\nشناسه ثبت‌شده: ${fromId}\n\n${helpText(true)}`,
        );
        return { ok: true };
      }
      if (isAdminCall) {
        await reply(`🛡 پنل ادمین ${PRODUCT}\n\n${helpText(true)}`);
        return { ok: true };
      }
      await reply("شما ادمین این ربات نیستید.");
      return { ok: true };
    }

    // ————— از اینجا فقط ادمین —————
    if (
      ["/botinfo", "/bot", "/setadmin", "/token", "/miniapp", "/webhook", "/stats", "/broadcast"]
        .includes(cmd)
    ) {
      if (!isAdminCall) {
        await reply("این دستور فقط برای ادمین ربات است.");
        return { ok: true };
      }

      if (cmd === "/botinfo") {
        await reply(
          [
            `ربات: ${cfg.displayName}${cfg.username ? ` (@${cfg.username})` : ""}`,
            `وضعیت: ${cfg.enabled ? "روشن" : "خاموش"}`,
            `ادمین: ${cfg.adminTelegramUserId ?? "— تنظیم نشده —"}`,
            `مینی‌اپ: ${cfg.miniAppUrl ?? "— تنظیم نشده —"}`,
            `webhook secret: تنظیم شده`,
            "",
            `Powered By ${DEVELOPER}`,
          ].join("\n"),
        );
        return { ok: true };
      }

      if (cmd === "/bot") {
        if (rest !== "on" && rest !== "off") {
          await reply("استفاده: /bot on  یا  /bot off");
          return { ok: true };
        }
        const enabled = rest === "on";
        await ctx.runMutation(internal.telegram.botSetEnabledInternal, {
          botConfigId: args.botConfigId,
          enabled,
        });
        await reply(enabled ? "✅ ربات روشن شد." : "⏸ ربات خاموش شد.");
        return { ok: true };
      }

      if (cmd === "/setadmin") {
        const newId = Number(rest.replace(/[^0-9]/g, ""));
        if (!rest || !Number.isFinite(newId) || newId <= 0 || String(newId) !== rest.trim()) {
          await reply(
            "استفاده: /setadmin 123456789\n\nشناسه عددی را با /id از کاربر بگیرید.",
          );
          return { ok: true };
        }
        await ctx.runMutation(internal.telegram.botClaimAdminInternal, {
          botConfigId: args.botConfigId,
          telegramUserId: newId,
        });
        await reply(`✅ ادمین ربات به شناسه ${newId} تغییر کرد.`);
        return { ok: true };
      }

      if (cmd === "/token") {
        if (rest.length < 40 || !rest.includes(":")) {
          await reply(
            "استفاده: /token <توکن جدید BotFather>\n\nتوکن در پایگاه داده رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شود.",
          );
          return { ok: true };
        }
        const envelope = encryptSecret(rest, masterSecret, {
          aad: `tenant:${cfg.tenantId}|purpose:telegram_bot_token`,
          purpose: "telegram_bot_token",
        });
        await ctx.runMutation(internal.telegram.botSetTokenInternal, {
          botConfigId: args.botConfigId,
          tokenEncrypted: envelope,
          byTelegramUserId: fromId ?? 0,
        });
        await reply("✅ توکن ربات جایگزین شد (رمزنگاری‌شده).");
        return { ok: true };
      }

      if (cmd === "/miniapp") {
        if (!/^https:\/\/.+/.test(rest)) {
          await reply("استفاده: /miniapp https://app.example.com");
          return { ok: true };
        }
        await ctx.runMutation(internal.telegram.botSetMiniAppInternal, {
          botConfigId: args.botConfigId,
          miniAppUrl: rest,
        });
        let menuNote = "";
        try {
          await ctx.runAction(internal.telegramActions.setBotMenuButtonInternal, {
            botToken,
            miniAppUrl: rest,
            text: "اپ من",
          });
          menuNote = "دکمه منوی ربات هم تنظیم شد.";
        } catch {
          menuNote = "تنظیم دکمه منو ناموفق بود (URL باید از BotFather مجاز شده باشد).";
        }
        await reply(`✅ مینی‌اپ ثبت شد: ${rest}\n${menuNote}`);
        return { ok: true };
      }

      if (cmd === "/webhook") {
        const base = rest.replace(/\/+$/, "");
        if (!/^https:\/\/.+/.test(base)) {
          await reply("استفاده: /webhook https://panel.example.com");
          return { ok: true };
        }
        try {
          await ctx.runAction(internal.telegramActions.setBotWebhookInternal, {
            botToken,
            webhookUrl: `${base}/api/v1/telegram/webhook/${args.botConfigId}`,
            webhookSecret: cfg.webhookSecret,
          });
          await reply(`✅ webhook تنظیم شد:\n${base}/api/v1/telegram/webhook/…`);
        } catch (e) {
          await reply(
            `❌ تنظیم webhook ناموفق بود: ${e instanceof Error ? e.message : "خطا"}`,
          );
        }
        return { ok: true };
      }

      if (cmd === "/stats") {
        const s = await ctx.runQuery(internal.telegram.botStatsInternal, {
          botConfigId: args.botConfigId,
          tenantId: cfg.tenantId,
        });
        await reply(
          [
            "📊 آمار ربات:",
            `کاربران ربات: ${s.botUsers}`,
            `اتصال‌یافته به حساب: ${s.linked}`,
            `کاربران tenant: ${s.tenantUsers}`,
            `با تلگرام متصل: ${s.telegramLinked}`,
          ].join("\n"),
        );
        return { ok: true };
      }

      if (cmd === "/broadcast") {
        if (!rest) {
          await reply("استفاده: /broadcast متن پیام");
          return { ok: true };
        }
        const ids = await ctx.runQuery(internal.telegram.botLinkedChatIds, {
          botConfigId: args.botConfigId,
        });
        const targets = [...new Set([...ids, cfg.adminTelegramUserId ?? null].filter(
          (x): x is number => x !== null,
        ))].slice(0, 200);
        let sent = 0;
        for (const chatIdNum of targets) {
          try {
            await ctx.runAction(internal.telegramActions.sendBotReply, {
              botToken,
              chatId: String(chatIdNum),
              text: `📣 ${rest}`,
            });
            sent += 1;
          } catch {
            // یک ارسال ناموفق، بقیه را متوقف نمی‌کند
          }
        }
        await reply(`✅ پیام به ${sent} کاربر ارسال شد.`);
        return { ok: true };
      }
    }

    if (args.text.trim().startsWith("/")) {
      await reply("دستور ناشناخته است — /help را بفرستید.");
      return { ok: true };
    }
    // پیام معمولی بدون اسلش — پاسخ نمی‌دهیم
    return { ok: true };
  },
});
