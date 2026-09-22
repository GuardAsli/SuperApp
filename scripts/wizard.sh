#!/usr/bin/env bash
# GuardAsli is0.0.1 — ویزارد نصب جامع یک‌مرحله‌ای
# Product: GuardAsli · Developer: AsliCode
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

C_CYAN='\033[1;36m'
C_GREEN='\033[1;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[1;31m'
C_RESET='\033[0m'

info()  { printf "${C_CYAN}[GuardAsli]${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}[OK]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[!]${C_RESET} %s\n" "$*"; }
die()   { printf "${C_RED}[ERR]${C_RESET} %s\n" "$*" >&2; exit 1; }

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

echo ""
echo "═══════════════════════════════════════════"
echo "  GuardAsli is0.0.1 — ویزارد نصب جامع"
echo "  توسعه‌ی AsliCode"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Prerequisites ──
info "۱) بررسی پیش‌نیازها…"
command -v bun >/dev/null 2>&1 || die "bun نصب نیست: https://bun.sh"
ok "bun $(bun --version)"

if ! command -v curl >/dev/null 2>&1; then
  warn "curl یافت نشد — برخی مراحل ممکن است نیاز داشته باشند"
fi

# ── 2. Dependencies ──
info "۲) نصب وابستگی‌ها…"
bun install
ok "dependencies"

# ── 3. Secrets / .env.local ──
info "۳) تولید secrets و فایل env…"
ENV_FILE="$ROOT/.env.local"
if [ -f "$ENV_FILE" ]; then
  warn ".env.local موجود است — بازنویسی نمی‌شود (برای ساخت مجدد حذف کنید)"
else
  MASTER="$(rand_hex)"
  PEPPER="$(rand_hex)"
  SALT="$(rand_hex)"
  cat > "$ENV_FILE" <<EOF
# GuardAsli is0.0.1 — تولیدشده توسط wizard $(date -u +%Y-%m-%dT%H:%MZ)
# Product: GuardAsli · Developer: AsliCode

VITE_CONVEX_URL=
CONVEX_DEPLOYMENT=

GUARDASLI_ENV=development
GUARDASLI_MASTER_SECRET=${MASTER}
GUARDASLI_TOKEN_PEPPER=${PEPPER}
GUARDASLI_AEAD_SALT=${SALT}
GUARDASLI_AEAD_KID=k1
GUARDASLI_PUBLIC_URL=http://127.0.0.1:5173
GUARDASLI_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173

GUARDASLI_PRODUCT=GuardAsli
GUARDASLI_DEVELOPER=AsliCode
GUARDASLI_VERSION=is0.0.1
EOF
  ok ".env.local ساخته شد (secrets تصادفی)"
fi

# بارگذاری برای مراحل بعدی
set -a
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set +a

# ── 4. Quality gates ──
info "۴) typecheck + test + build…"
bun run typecheck
ok "typecheck"
bun test
ok "tests"
bun run build
ok "build"

# ── 5. Release check ──
info "۵) release-check…"
bun run release-check || warn "release-check با هشدار تمام شد"

# ── 6. Convex (اختیاری تعاملی) ──
info "۶) Convex"
if command -v convex >/dev/null 2>&1 || bunx convex --version >/dev/null 2>&1; then
  echo ""
  printf "  آیا همین حالا convex dev/deploy را اجرا کنم؟ [y/N]: "
  read -r DO_CONVEX || DO_CONVEX=n
  if [ "${DO_CONVEX}" = "y" ] || [ "${DO_CONVEX}" = "Y" ]; then
    info "در حال اجرای bunx convex dev (یک‌بار codegen)…"
    # غیرتعاملی: فقط اگر CONVEX_DEPLOYMENT ست باشد deploy
    if [ -n "${CONVEX_DEPLOYMENT:-}" ]; then
      bunx convex deploy || warn "convex deploy ناموفق — دستی اجرا کنید"
    else
      warn "CONVEX_DEPLOYMENT خالی است."
      warn "دستی: bunx convex dev   سپس URL را در .env.local بگذارید"
    fi
  else
    warn "رد شد. بعداً: bunx convex dev"
  fi
else
  warn "convex CLI از طریق bunx در دسترس است: bunx convex dev"
fi

# ── 7. Bootstrap hint ──
echo ""
info "۷) Bootstrap Super Admin (بعد از convex deploy):"
echo "  export \$(grep -v '^#' .env.local | xargs)   # اختیاری"
echo "  bunx convex run authActions:bootstrapAdminAction \\"
echo "    '{\"username\":\"admin\",\"password\":\"Abcd1234!xyz\"}'"
echo ""
info "۸) اجرای UI:"
echo "  bun run dev"
echo ""
ok "ویزارد تمام شد — آماده تست محلی"
echo "  Product: GuardAsli · Developer: AsliCode · is0.0.1"
echo ""
