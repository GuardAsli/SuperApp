/** GuardAsli — اعتبارسنجی سخت محیط production. */

export interface ProdEnvReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function env(name: string): string | undefined {
  try {
    if (typeof process === "undefined") return undefined;
    const v = (process as { env?: Record<string, string> }).env?.[name];
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function isProductionEnv(): boolean {
  return env("NODE_ENV") === "production" || env("GUARDASLI_ENV") === "production";
}

/**
 * قبل از deploy / در prod-start فراخوانی شود.
 * در حالت production هر خطای missing → ok=false.
 */
export function validateProductionEnv(): ProdEnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = isProductionEnv();

  const master = env("GUARDASLI_MASTER_SECRET");
  const pepper = env("GUARDASLI_TOKEN_PEPPER");
  const salt = env("GUARDASLI_AEAD_SALT");
  const cors = env("GUARDASLI_CORS_ORIGINS");
  const publicUrl = env("GUARDASLI_PUBLIC_URL");

  if (prod) {
    if (!master || master.length < 32) {
      errors.push("GUARDASLI_MASTER_SECRET الزامی و ≥32 کاراکتر در production");
    }
    if (!pepper || pepper.length < 16) {
      errors.push("GUARDASLI_TOKEN_PEPPER الزامی و ≥16 در production");
    }
    if (!salt || salt.length < 16) {
      errors.push("GUARDASLI_AEAD_SALT الزامی و ≥16 در production");
    }
    if (!cors || cors.includes("*")) {
      errors.push("GUARDASLI_CORS_ORIGINS باید allowlist واقعی باشد (بدون *)");
    }
    if (!publicUrl || publicUrl.startsWith("http://") && !publicUrl.includes("localhost")) {
      if (!publicUrl || !publicUrl.startsWith("https://")) {
        errors.push("GUARDASLI_PUBLIC_URL باید https:// در production باشد");
      }
    }
    // جلوگیری از نشت secret به باندل فرانت
    const viteKeys = [
      "VITE_GUARDASLI_MASTER_SECRET",
      "VITE_GUARDASLI_TOKEN_PEPPER",
      "VITE_MASTER_SECRET",
    ];
    for (const k of viteKeys) {
      if (env(k)) errors.push(`${k} نباید وجود داشته باشد — secret در کلاینت ممنوع`);
    }
  } else {
    if (!master) warnings.push("GUARDASLI_MASTER_SECRET خالی است");
    if (!pepper) warnings.push("GUARDASLI_TOKEN_PEPPER خالی است (dev fallback)");
  }

  if (cors === "*") {
    (prod ? errors : warnings).push("CORS=* ناامن است");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** پرتاب خطا اگر production و نامعتبر. */
export function assertProductionEnv(): void {
  if (!isProductionEnv()) return;
  const r = validateProductionEnv();
  if (!r.ok) {
    throw new Error(`PRODUCTION_ENV_INVALID: ${r.errors.join("; ")}`);
  }
}
