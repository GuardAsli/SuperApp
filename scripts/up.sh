#!/usr/bin/env bash
# GuardAsli — بعد از wizard همه چیز را خودکار بالا می‌آورد
# Product: GuardAsli · Developer: AsliCode
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info() { printf "\033[1;36m[GuardAsli]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[OK]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }

if [ ! -f "$ROOT/.env.local" ]; then
  info "env نیست — اجرای wizard…"
  bash "$ROOT/scripts/wizard.sh"
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local" 2>/dev/null || true
set +a

# همگام env به Convex
bun "$ROOT/scripts/sync-convex-env.mjs" 2>/dev/null || true

# اگر URL نیست، سعی در codegen یک‌بار
if [ -z "${VITE_CONVEX_URL:-}" ]; then
  warn "VITE_CONVEX_URL خالی — تلاش codegen"
  timeout 60 bunx convex codegen 2>/dev/null || true
  if [ -f "$ROOT/.env" ]; then
    set -a
    source "$ROOT/.env" 2>/dev/null || true
    set +a
  fi
  set -a
  source "$ROOT/.env.local" 2>/dev/null || true
  set +a
fi

if [ -z "${VITE_CONVEX_URL:-}" ]; then
  warn "هنوز URL ندارید. یک‌بار این دو را اجرا کنید (فقط اولین‌بار):"
  echo "  bunx convex login"
  echo "  bunx convex dev"
  echo "سپس دوباره: bun run up"
  exit 1
fi

ok "Convex URL: ${VITE_CONVEX_URL}"

# bootstrap
bun "$ROOT/scripts/auto-bootstrap.mjs" || warn "bootstrap — اگر قبلاً ساخته شده نادیده بگیرید"

# اجرای همزمان: convex dev (اگر لازم) + vite
info "اجرای UI روی http://127.0.0.1:5173"

# اگر کاربر CONVEX_RUN_BACKEND=1 بخواهد، convex dev موازی
if [ "${CONVEX_RUN_BACKEND:-1}" = "1" ]; then
  info "شروع convex dev در پس‌زمینه…"
  bunx convex dev --once 2>/dev/null || true
  # push functions
  (bunx convex dev >> "$ROOT/.guardasli-convex.log" 2>&1 &) || true
  sleep 2
fi

export PORT="${PORT:-5173}"
exec bun run dev
