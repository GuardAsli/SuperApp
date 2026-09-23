/**
 * GuardAsli — منطق محض مرز مستأجر (tenant isolation).
 * این توابع هیچ وابستگی به Convex ندارند تا مستقیماً تست شوند (بند ۴۴).
 * قاعده: بازیگر فقط به درخت مستأجر خودش (خود + نسل‌های پایین‌دست) دسترسی دارد؛
 * tenant Core (config.core === true) به همه‌جا دسترسی دارد. هیچ مسیر دیگری مجاز نیست.
 */

export interface TenantRef {
  _id: string;
  parentTenantId?: string | undefined;
  config?: { core?: boolean } | undefined;
}

/**
 * پیمایش درخت مستأجر از گره مقصد به سمت بالا.
 * دسترسی مجاز است فقط اگر در این مسیر به tenant بازیگر برسیم
 * (یعنی مقصد، خودِ بازیگر یا یکی از نسل‌های پایین‌دست او باشد).
 */
export function tenantScopeWalk(
  actorTenantId: string,
  resourceTenantId: string,
  getTenant: (id: string) => TenantRef | null | undefined,
): { ok: boolean; reason?: string } {
  if (actorTenantId === resourceTenantId) return { ok: true };
  const actorTenant = getTenant(actorTenantId);
  if (actorTenant?.config?.core === true) return { ok: true };

  let cur = getTenant(resourceTenantId);
  let depth = 0;
  while (cur && depth < 32) {
    if (cur._id === actorTenantId) return { ok: true };
    if (!cur.parentTenantId) break;
    cur = getTenant(cur.parentTenantId);
    depth++;
  }
  return { ok: false, reason: "FORBIDDEN: دسترسی بین‌مستأجری مجاز نیست" };
}

/** مجموعه‌ی شناسه‌های درخت مستأجر (خود + نسل‌های پایین‌دست، BFS). */
export function tenantTreeIds(
  rootTenantId: string,
  getChildren: (id: string) => TenantRef[],
): string[] {
  const out: string[] = [];
  const queue: string[] = [rootTenantId];
  let processed = 0;
  while (queue.length > 0 && processed < 32) {
    const cur = queue.shift()!;
    out.push(cur);
    processed++;
    for (const c of getChildren(cur)) queue.push(c._id);
  }
  return out;
}
