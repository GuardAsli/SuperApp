#!/usr/bin/env bash
# GuardAsli is0.0.1 — مسیر اجرای مطمئن production
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[guardasli] release check…"
bun "$ROOT/scripts/release-check.mjs"

echo "[guardasli] install…"
bun install --frozen-lockfile

echo "[guardasli] ci (typecheck + test + build)…"
bun run ci

if [ -z "${GUARDASLI_MASTER_SECRET:-}" ]; then
  echo "[guardasli] WARN: GUARDASLI_MASTER_SECRET خالی است — قبل از deploy تنظیم کنید"
fi

echo "[guardasli] آماده‌ی convex deploy / preview"
echo "  bunx convex deploy"
echo "  bun run preview"
echo "  bootstrap: bunx convex run authActions:bootstrapAdminAction '{\"username\":\"admin\",\"password\":\"...\"}'"
echo "[guardasli] OK is0.0.1"
