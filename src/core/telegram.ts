/** GuardAsli — Mini App تلگرام با مقایسه زمان‌ثابت. */
import { createHmac } from "node:crypto";
import { constantTimeEqualHex } from "./sidechannel";

export interface TelegramInitData {
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

export function verifyTelegramInitData(initData: string, botToken: string): TelegramInitData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (!constantTimeEqualHex(computed, hash)) return null;
    const authDate = Number(params.get("auth_date") ?? "0");
    if (!Number.isFinite(authDate) || authDate <= 0) return null;
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (typeof user?.id !== "number") return null;
    return { ...Object.fromEntries(params), user, auth_date: authDate, hash };
  } catch {
    return null;
  }
}
