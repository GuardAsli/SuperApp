#!/usr/bin/env bash
# GuardAsli is0.0.1 — مسیر اجرای مطمئن production با gate سخت env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[guardasli] release check…"
bun "$ROOT/scripts/release-check.mjs"

echo "[guardasli] install…"
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  bun install --frozen-lockfile || bun install
else
  bun install
fi

echo "[guardasli] ci…"
bun run ci

# ── Production env hard gate ──
export GUARDASLI_ENV="${GUARDASLI_ENV:-production}"
export NODE_ENV="${NODE_ENV:-production}"

fail=0
need() {
  local name="$1" min="${2:-1}"
  local val="${!name:-}"
  if [ -z "$val" ] || [ "${#val}" -lt "$min" ]; then
    echo "[guardasli] ERR: $name الزامی است (حداقل $min کاراکتر)"
    fail=1
  fi
}

need GUARDASLI_MASTER_SECRET 32
need GUARDASLI_TOKEN_PEPPER 16
need GUARDASLI_AEAD_SALT 16
need GUARDASLI_CORS_ORIGINS 8
need GUARDASLI_PUBLIC_URL 12

if echo "${GUARDASLI_CORS_ORIGINS:-}" | grep -q '\*'; then
  echo "[guardasli] ERR: CORS نباید * باشد"
  fail=1
fi

if [[ "${GUARDASLI_PUBLIC_URL:-}" != https://* ]]; then
  echo "[guardasli] ERR: GUARDASLI_PUBLIC_URL باید با https:// شروع شود"
  fail=1
fi

if [ -n "${VITE_GUARDASLI_MASTER_SECRET:-}" ] || [ -n "${VITE_GUARDASLI_TOKEN_PEPPER:-}" ]; then
  echo "[guardasli] ERR: secret در VITE_* ممنوع است"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[guardasli] production env نامعتبر — deploy متوقف شد"
  exit 1
fi

echo "[guardasli] production env OK"
echo "  deploy: bunx convex deploy"
echo "  (secrets را در Convex Dashboard → Environment Variables هم ست کنید)"
echo "[guardasli] OK is0.0.1"
