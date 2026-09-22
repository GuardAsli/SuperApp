#!/usr/bin/env bash
# =============================================================================
# GuardAsli is0.0.1 — نصب‌کنندهٔ سرور (VPS / Linux)
# Product: GuardAsli · Developer: AsliCode
#
# یک دستور تا نصب نهایی روی سرور مجازی + دامنه:
#
#   curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | bash
#   # یا از داخل ریپو:
#   sudo bash install.sh --domain panel.example.com --email admin@example.com
#
# متغیرهای اختیاری:
#   GUARDASLI_DOMAIN=panel.example.com
#   GUARDASLI_EMAIL=admin@example.com
#   GUARDASLI_INSTALL_DIR=/opt/guardasli
#   CONVEX_DEPLOY_KEY=...          # توصیه برای غیرتعاملی
#   GUARDASLI_ADMIN_USER=admin
#   GUARDASLI_ADMIN_PASS=...
#   GUARDASLI_SKIP_SSL=1
#   GUARDASLI_SKIP_NGINX=1
# =============================================================================
set -euo pipefail

DOMAIN="${GUARDASLI_DOMAIN:-}"
EMAIL="${GUARDASLI_EMAIL:-}"
INSTALL_DIR="${GUARDASLI_INSTALL_DIR:-/opt/guardasli}"
REPO_URL="${GUARDASLI_REPO:-https://github.com/GuardAsli/SuperApp.git}"
BRANCH="${GUARDASLI_BRANCH:-main}"
SKIP_SSL="${GUARDASLI_SKIP_SSL:-0}"
SKIP_NGINX="${GUARDASLI_SKIP_NGINX:-0}"
PORT_UI="${PORT:-4173}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --skip-ssl) SKIP_SSL=1; shift ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --help|-h)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_RESET='\033[0m'
info() { printf "${C_CYAN}[GuardAsli]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[OK]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[!]${C_RESET} %s\n" "$*"; }
die()  { printf "${C_RED}[ERR]${C_RESET} %s\n" "$*" >&2; exit 1; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "این نصب‌کننده برای VPS با root/sudo است: sudo bash install.sh --domain ..."
  fi
}

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}|${VERSION_ID:-}|${PRETTY_NAME:-}"
  else
    echo "unknown||"
  fi
}

install_system_packages() {
  info "نصب بسته‌های سیستم…"
  local id
  id="$(detect_os | cut -d'|' -f1)"
  case "$id" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y curl ca-certificates git unzip openssl \
        nginx certbot python3-certbot-nginx ufw \
        || warn "برخی بسته‌ها نصب نشدند"
      ;;
    centos|rhel|rocky|almalinux|fedora)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y curl ca-certificates git unzip openssl nginx certbot python3-certbot-nginx || true
      else
        yum install -y curl ca-certificates git unzip openssl nginx || true
      fi
      ;;
    *)
      warn "OS کمتر تست‌شده: $id — فقط curl/git/openssl لازم است"
      ;;
  esac
  ok "system packages"
}

install_bun() {
  if command -v bun >/dev/null 2>&1; then
    ok "bun $(bun --version)"
    return
  fi
  info "نصب bun…"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # برای root و systemd
  if [ -x /root/.bun/bin/bun ]; then
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun 2>/dev/null || true
  fi
  command -v bun >/dev/null 2>&1 || die "bun نصب نشد"
  ok "bun $(bun --version)"
}

clone_or_update() {
  info "کد منبع → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
  else
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "repo"
}

write_env() {
  local envf="$INSTALL_DIR/.env.local"
  local master pepper salt admin_pass pub
  if [ -n "$DOMAIN" ]; then
    pub="https://${DOMAIN}"
  else
    pub="http://127.0.0.1:${PORT_UI}"
  fi

  if [ -f "$envf" ] && grep -q 'GUARDASLI_MASTER_SECRET=.' "$envf" 2>/dev/null; then
    ok "env موجود — حفظ secrets"
  else
    master="$(rand_hex)"
    pepper="$(rand_hex)"
    salt="$(rand_hex)"
    admin_pass="${GUARDASLI_ADMIN_PASS:-Ga$(rand_hex | cut -c1-12)A1}"
    cat > "$envf" <<EOF
# GuardAsli VPS install $(date -u +%Y-%m-%dT%H:%MZ)
GUARDASLI_ENV=production
NODE_ENV=production

VITE_CONVEX_URL=${VITE_CONVEX_URL:-}
CONVEX_DEPLOYMENT=${CONVEX_DEPLOYMENT:-}
CONVEX_DEPLOY_KEY=${CONVEX_DEPLOY_KEY:-}

GUARDASLI_MASTER_SECRET=${master}
GUARDASLI_TOKEN_PEPPER=${pepper}
GUARDASLI_AEAD_SALT=${salt}
GUARDASLI_AEAD_KID=k1
GUARDASLI_PUBLIC_URL=${pub}
GUARDASLI_CORS_ORIGINS=${pub}
GUARDASLI_DOMAIN=${DOMAIN}

GUARDASLI_ADMIN_USER=${GUARDASLI_ADMIN_USER:-admin}
GUARDASLI_ADMIN_PASS=${admin_pass}

GUARDASLI_PRODUCT=GuardAsli
GUARDASLI_DEVELOPER=AsliCode
GUARDASLI_VERSION=is0.0.1
PORT=${PORT_UI}
EOF
    chmod 600 "$envf"
    ok ".env.local"
  fi

  # دامنه را همیشه به‌روز کن
  if [ -n "$DOMAIN" ]; then
    sed -i.bak "s|^GUARDASLI_PUBLIC_URL=.*|GUARDASLI_PUBLIC_URL=https://${DOMAIN}|" "$envf" 2>/dev/null || true
    sed -i.bak "s|^GUARDASLI_CORS_ORIGINS=.*|GUARDASLI_CORS_ORIGINS=https://${DOMAIN}|" "$envf" 2>/dev/null || true
    sed -i.bak "s|^GUARDASLI_DOMAIN=.*|GUARDASLI_DOMAIN=${DOMAIN}|" "$envf" 2>/dev/null || true
    grep -q '^GUARDASLI_DOMAIN=' "$envf" || echo "GUARDASLI_DOMAIN=${DOMAIN}" >> "$envf"
  fi
}

run_app_install() {
  info "bun install + CI + deploy…"
  cd "$INSTALL_DIR"
  export PATH="${HOME}/.bun/bin:/usr/local/bin:$PATH"
  set -a
  # shellcheck disable=SC1091
  source "$INSTALL_DIR/.env.local"
  set +a

  bun install --frozen-lockfile 2>/dev/null || bun install
  bun run typecheck
  bun test
  bun run build

  if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
    info "Convex deploy (deploy key)…"
    bunx convex deploy --yes 2>/dev/null || bunx convex deploy || warn "deploy — لاگ را ببینید"
    bun scripts/sync-convex-env.mjs || warn "sync-env"
  elif [ -n "${VITE_CONVEX_URL:-}" ]; then
    bunx convex deploy --yes 2>/dev/null || bunx convex deploy || true
    bun scripts/sync-convex-env.mjs || true
  else
    warn "CONVEX_DEPLOY_KEY / VITE_CONVEX_URL خالی است."
    warn "یک‌بار روی سرور: bunx convex login && bunx convex dev"
    warn "سپس: cd $INSTALL_DIR && bash scripts/finish-vps.sh"
  fi

  bun scripts/auto-bootstrap.mjs || warn "bootstrap بعداً با finish-vps"
  ok "app"
}

setup_nginx() {
  [ "$SKIP_NGINX" = "1" ] && return 0
  [ -z "$DOMAIN" ] && { warn "دامنه نیست — nginx رد شد"; return 0; }
  command -v nginx >/dev/null 2>&1 || { warn "nginx نیست"; return 0; }

  info "Nginx reverse-proxy برای $DOMAIN"
  cat > "/etc/nginx/sites-available/guardasli" <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT_UI};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGX
  ln -sf /etc/nginx/sites-available/guardasli /etc/nginx/sites-enabled/guardasli 2>/dev/null || true
  # debian-style; در غیر این صورت conf.d
  if [ ! -d /etc/nginx/sites-enabled ]; then
    cp /etc/nginx/sites-available/guardasli /etc/nginx/conf.d/guardasli.conf 2>/dev/null || true
  fi
  nginx -t && systemctl reload nginx || systemctl restart nginx || warn "nginx reload"
  ok "nginx"

  if [ "$SKIP_SSL" != "1" ] && [ -n "$EMAIL" ]; then
    info "Let's Encrypt…"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect \
      || warn "certbot ناموفق — DNS A record را چک کنید"
  elif [ "$SKIP_SSL" != "1" ]; then
    warn "برای SSL: --email you@domain.com"
  fi
}

setup_systemd() {
  info "systemd unit…"
  local bun_bin
  bun_bin="$(command -v bun || echo /usr/local/bin/bun)"
  cat > /etc/systemd/system/guardasli.service <<UNIT
[Unit]
Description=GuardAsli Web (AsliCode)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env.local
Environment=NODE_ENV=production
Environment=PORT=${PORT_UI}
ExecStart=${bun_bin} run preview --host 127.0.0.1 --port ${PORT_UI}
Restart=always
RestartSec=5
LimitNOFILE=65535
# عملکرد: بدون core dump حجیم
LimitCORE=0

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable guardasli
  systemctl restart guardasli
  ok "systemd guardasli.service"
}

firewall_hint() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ufw allow OpenSSH 2>/dev/null || true
  fi
}

print_summary() {
  set -a
  # shellcheck disable=SC1091
  source "$INSTALL_DIR/.env.local" 2>/dev/null || true
  set +a
  echo ""
  echo "═══════════════════════════════════════════"
  ok "نصب VPS تمام شد — GuardAsli is0.0.1"
  echo "  مسیر:    $INSTALL_DIR"
  echo "  دامنه:   ${DOMAIN:- (تنظیم نشده)}"
  echo "  Admin:   ${GUARDASLI_ADMIN_USER:-admin}"
  echo "  Pass:    ${GUARDASLI_ADMIN_PASS:-(در .env.local)}"
  if [ -n "$DOMAIN" ]; then
    echo "  URL:     https://${DOMAIN}"
  else
    echo "  URL:     http://SERVER_IP:${PORT_UI}"
  fi
  echo ""
  echo "  وضعیت:   systemctl status guardasli"
  echo "  لاگ:     journalctl -u guardasli -f"
  echo "  تکمیل:   cd $INSTALL_DIR && bash scripts/finish-vps.sh"
  echo "═══════════════════════════════════════════"
}

# ── main ──
echo ""
echo " GuardAsli VPS Installer · AsliCode · is0.0.1"
echo " OS: $(detect_os)"
echo ""

need_root
install_system_packages
install_bun
clone_or_update
write_env
run_app_install
firewall_hint
setup_nginx
setup_systemd
print_summary
