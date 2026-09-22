#!/usr/bin/env bash
# GuardAsli is0.0.1 — ویزارد نصب تمام‌خودکار (بدون پرسش)
# Product: GuardAsli · Developer: AsliCode
#
# استفاده:
#   bun run wizard              # نصب کامل + تلاش برای Convex + bootstrap
#   bun run up                  # بعد از wizard: backend+UI را بالا می‌آورد
#
# اختیاری از قبل:
#   CONVEX_DEPLOY_KEY=...       # deploy غیرتعاملی
#   GUARDASLI_ADMIN_USER=admin
#   GUARDASLI_ADMIN_PASS=...
#   GUARDASLI_SKIP_CI=1         # رد typecheck/test/build
#   GUARDASLI_SKIP_CONVEX=1     # فقط env+deps
#
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

# رمز bootstrap: قوی و قابل‌پیش‌بینی برای dev (قابل override)
ADMIN_USER="${GUARDASLI_ADMIN_USER:-admin}"
ADMIN_PASS="${GUARDASLI_ADMIN_PASS:-}"
if [ -z "$ADMIN_PASS" ]; then
  # تولید یک‌بار و ذخیره در .env.local
  ADMIN_PASS="Ga$(rand_hex | cut -c1-10)A1"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  GuardAsli is0.0.1 — ویزارد تمام‌خودکار"
echo "  توسعه‌ی AsliCode"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Prerequisites ──
info "۱) پیش‌نیازها"
command -v bun >/dev/null 2>&1 || die "bun لازم است: curl -fsSL https://bun.sh/install | bash"
ok "bun $(bun --version)"

# ── 2. Dependencies ──
info "۲) وابستگی‌ها"
bun install
ok "bun install"

# ── 3. Env + secrets ──
info "۳) secrets و .env.local"
ENV_FILE="$ROOT/.env.local"
STATE_FILE="$ROOT/.guardasli-install.json"

if [ ! -f "$ENV_FILE" ]; then
  MASTER="$(rand_hex)"
  PEPPER="$(rand_hex)"
  SALT="$(rand_hex)"
  cat > "$ENV_FILE" <<EOF
# GuardAsli is0.0.1 — wizard $(date -u +%Y-%m-%dT%H:%MZ)
# Product: GuardAsli · Developer: AsliCode

VITE_CONVEX_URL=
CONVEX_DEPLOYMENT=
CONVEX_DEPLOY_KEY=

GUARDASLI_ENV=development
GUARDASLI_MASTER_SECRET=${MASTER}
GUARDASLI_TOKEN_PEPPER=${PEPPER}
GUARDASLI_AEAD_SALT=${SALT}
GUARDASLI_AEAD_KID=k1
GUARDASLI_PUBLIC_URL=http://127.0.0.1:5173
GUARDASLI_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173

GUARDASLI_ADMIN_USER=${ADMIN_USER}
GUARDASLI_ADMIN_PASS=${ADMIN_PASS}

GUARDASLI_PRODUCT=GuardAsli
GUARDASLI_DEVELOPER=AsliCode
GUARDASLI_VERSION=is0.0.1
EOF
  ok ".env.local ساخته شد"
else
  # تکمیل فیلدهای خالی بدون overwrite secrets
  if ! grep -q '^GUARDASLI_ADMIN_USER=' "$ENV_FILE" 2>/dev/null; then
    echo "GUARDASLI_ADMIN_USER=${ADMIN_USER}" >> "$ENV_FILE"
  fi
  if ! grep -q '^GUARDASLI_ADMIN_PASS=' "$ENV_FILE" 2>/dev/null; then
    echo "GUARDASLI_ADMIN_PASS=${ADMIN_PASS}" >> "$ENV_FILE"
  fi
  if ! grep -q '^GUARDASLI_MASTER_SECRET=.' "$ENV_FILE" 2>/dev/null; then
    echo "GUARDASLI_MASTER_SECRET=$(rand_hex)" >> "$ENV_FILE"
  fi
  if ! grep -q '^GUARDASLI_TOKEN_PEPPER=.' "$ENV_FILE" 2>/dev/null; then
    echo "GUARDASLI_TOKEN_PEPPER=$(rand_hex)" >> "$ENV_FILE"
  fi
  if ! grep -q '^GUARDASLI_AEAD_SALT=.' "$ENV_FILE" 2>/dev/null; then
    echo "GUARDASLI_AEAD_SALT=$(rand_hex)" >> "$ENV_FILE"
  fi
  ok ".env.local موجود — تکمیل شد"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set +a

ADMIN_USER="${GUARDASLI_ADMIN_USER:-admin}"
ADMIN_PASS="${GUARDASLI_ADMIN_PASS:-Abcd1234!xyz}"

# ── 4. CI gates ──
if [ "${GUARDASLI_SKIP_CI:-0}" != "1" ]; then
  info "۴) typecheck + test + build"
  bun run typecheck
  ok "typecheck"
  bun test
  ok "tests"
  bun run build
  ok "build"
  bun run release-check || warn "release-check هشدار"
else
  warn "۴) CI رد شد (GUARDASLI_SKIP_CI=1)"
fi

# ── 5. Convex خودکار ──
if [ "${GUARDASLI_SKIP_CONVEX:-0}" = "1" ]; then
  warn "۵) Convex رد شد"
else
  info "۵) Convex — تلاش خودکار"
  bunx convex --version >/dev/null 2>&1 || warn "convex CLI از bunx"

  # اگر deploy key هست → deploy غیرتعاملی + env set
  if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
    info "CONVEX_DEPLOY_KEY یافت شد — deploy"
    bunx convex deploy --cmd 'echo deployed' 2>/dev/null || bunx convex deploy || warn "deploy ناموفق"
    # تلاش برای ست کردن env روی deployment
    bun "$ROOT/scripts/sync-convex-env.mjs" || warn "sync env جزئی ناموفق"
  elif [ -n "${VITE_CONVEX_URL:-}" ] && [ -n "${CONVEX_DEPLOYMENT:-}" ]; then
    ok "deployment از قبل پیکربندی شده"
    bun "$ROOT/scripts/sync-convex-env.mjs" || true
  else
    # تلاش codegen بدون تعامل طولانی
    info "codegen / once (اگر قبلاً login شده باشید کار می‌کند)"
    if timeout 90 bunx convex codegen 2>/dev/null; then
      ok "codegen"
    else
      warn "codegen نیاز به login یک‌باره دارد:"
      warn "  bunx convex login"
      warn "  bunx convex dev   # یک‌بار تا URL ساخته شود، Ctrl+C"
      warn "سپس دوباره: bun run wizard   یا   bun run up"
    fi
  fi

  # به‌روزرسانی URL از .env.local اگر convex آن را نوشته
  if [ -f "$ROOT/.env.local" ]; then
    set -a
    source "$ROOT/.env.local" 2>/dev/null || true
    set +a
  fi

  # خواندن از .env که convex گاهی می‌سازد
  if [ -f "$ROOT/.env" ]; then
    CONVEX_URL_LINE="$(grep -E '^VITE_CONVEX_URL=' "$ROOT/.env" 2>/dev/null | tail -1 || true)"
    if [ -n "$CONVEX_URL_LINE" ]; then
      if ! grep -q '^VITE_CONVEX_URL=.' "$ENV_FILE" 2>/dev/null; then
        echo "$CONVEX_URL_LINE" >> "$ENV_FILE"
      else
        # به‌روزرسانی مقدار
        VAL="${CONVEX_URL_LINE#VITE_CONVEX_URL=}"
        if command -v sed >/dev/null 2>&1; then
          sed -i.bak "s|^VITE_CONVEX_URL=.*|VITE_CONVEX_URL=${VAL}|" "$ENV_FILE" 2>/dev/null || true
        fi
      fi
      ok "VITE_CONVEX_URL همگام شد"
    fi
  fi
fi

# ── 6. Bootstrap خودکار ──
info "۶) Bootstrap Super Admin (خودکار در صورت آماده بودن backend)"
bun "$ROOT/scripts/auto-bootstrap.mjs" && ok "bootstrap" || warn "bootstrap بعداً با: bun run up"

# ── 7. State ──
cat > "$STATE_FILE" <<EOF
{
  "product": "GuardAsli",
  "developer": "AsliCode",
  "release": "is0.0.1",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%MZ)",
  "adminUser": "${ADMIN_USER}"
}
EOF

echo ""
ok "ویزارد تمام شد"
echo ""
echo "  Admin: ${ADMIN_USER}"
echo "  Pass:  ${ADMIN_PASS}"
echo "  (در .env.local ذخیره شده)"
echo ""
echo "  مرحله بعدی (یک دستور):"
echo "    bun run up"
echo ""
echo "  اگر اولین‌بار Convex هستید یک‌بار:"
echo "    bunx convex login && bunx convex dev"
echo "    (URL را می‌سازد) سپس دوباره: bun run up"
echo ""
