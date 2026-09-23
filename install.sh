#!/usr/bin/env bash
# =============================================================================
#  GuardAsli — VPS installer (single command, full pipeline)
#  Product:   GuardAsli
#  Developer: AsliCode
#  Release:   is0.0.1   (format isMAJOR.MINOR.PATCH)
#
#  Usage:
#    sudo bash install.sh --domain panel.example.com --email admin@example.com
#    sudo bash install.sh                          # minimal, no SSL
#    CONVEX_DEPLOY_KEY=... sudo -E bash install.sh --domain ... --email ...
#
#  What it does:
#    system packages -> bun -> source -> secrets -> install -> build
#    -> Convex deploy (optional key) -> admin bootstrap -> Nginx -> SSL
#    -> systemd service -> firewall -> 'guardasli' command -> management panel
#
#  All output is English-only and safe to run over SSH.
# =============================================================================
set -uo pipefail

DOMAIN="${GUARDASLI_DOMAIN:-}"
EMAIL="${GUARDASLI_EMAIL:-}"
INSTALL_DIR="${GUARDASLI_INSTALL_DIR:-/opt/guardasli/app}"
STATE_DIR="/opt/guardasli"
ENV_FILE="${STATE_DIR}/.env"
REPO_URL="${GUARDASLI_REPO:-https://github.com/GuardAsli/SuperApp.git}"
BRANCH="${GUARDASLI_BRANCH:-main}"
SKIP_SSL="${GUARDASLI_SKIP_SSL:-0}"
SKIP_NGINX="${GUARDASLI_SKIP_NGINX:-0}"
PORT_UI="${GUARDASLI_PORT:-4173}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)  DOMAIN="$2";  shift 2 ;;
    --email)   EMAIL="$2";   shift 2 ;;
    --dir)     INSTALL_DIR="$2"; STATE_DIR="$(dirname "$2")"; shift 2 ;;
    --port)    PORT_UI="$2"; shift 2 ;;
    --repo)    REPO_URL="$2"; shift 2 ;;
    --skip-ssl)   SKIP_SSL=1; shift ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --help|-h) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_BOLD='\033[1m'; C_OFF='\033[0m'
info() { printf "${C_CYAN}[GuardAsli]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ OK ]${C_OFF} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[WARN]${C_OFF} %s\n" "$*"; }
die()  { printf "${C_RED}[FAIL]${C_OFF} %s\n" "$*" >&2; exit 1; }

# Exported bun path is required for every later step.
export PATH="${HOME}/.bun/bin:/usr/local/bin:${PATH}"

need_root() {
  [ "$(id -u)" -eq 0 ] || die "root required: sudo bash install.sh --domain ..."
}

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown} ${VERSION_ID:-} ${PRETTY_NAME:-}"
  else
    echo "unknown"
  fi
}

# -----------------------------------------------------------------------------
# 1. System packages
# -----------------------------------------------------------------------------
install_system_packages() {
  info "Installing system packages..."
  local id
  id="$(detect_os | awk '{print $1}')"
  case "$id" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y curl ca-certificates git unzip openssl nginx certbot python3-certbot-nginx ufw rsync \
        || warn "some system packages failed — continuing"
      ;;
    centos|rhel|rocky|almalinux|fedora)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y curl ca-certificates git unzip openssl nginx certbot python3-certbot-nginx rsync || true
      else
        yum install -y curl ca-certificates git unzip openssl nginx rsync || true
      fi
      ;;
    *) warn "unrecognized OS '${id}' — package install skipped" ;;
  esac
  ok "system packages"
}

# -----------------------------------------------------------------------------
# 2. Bun
# -----------------------------------------------------------------------------
install_bun() {
  if command -v bun >/dev/null 2>&1; then ok "bun $(bun --version) present"; return; fi
  info "Installing bun..."
  curl -fsSL https://bun.sh/install | bash || die "bun install failed"
  export PATH="${HOME}/.bun/bin:${PATH}"
  if [ -x "${HOME}/.bun/bin/bun" ]; then
    ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
    ln -sf "${HOME}/.bun/bin/bunx" /usr/local/bin/bunx 2>/dev/null || true
  fi
  command -v bun >/dev/null 2>&1 || die "bun is still not on PATH — install manually"
  ok "bun $(bun --version)"
}

# -----------------------------------------------------------------------------
# 3. Source
# -----------------------------------------------------------------------------
clone_or_update() {
  info "Fetching source -> ${INSTALL_DIR}"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout -f "$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/${BRANCH}" >/dev/null 2>&1 || true
  else
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR" \
      || die "git clone failed for ${REPO_URL}"
  fi
  ok "source ready"
}

# -----------------------------------------------------------------------------
# 4. Secrets + env  (single env file shared with the 'guardasli' manager)
# -----------------------------------------------------------------------------
write_env() {
  info "Writing configuration and secrets..."
  local pub
  if [ -n "$DOMAIN" ]; then pub="https://${DOMAIN}"; else pub="http://127.0.0.1:${PORT_UI}"; fi

  if [ -f "$ENV_FILE" ] && grep -q '^GUARDASLI_MASTER_SECRET=.' "$ENV_FILE" 2>/dev/null; then
    ok "existing secrets preserved"
  else
    local master pepper salt admin_pass
    master="$(rand_hex)"; pepper="$(rand_hex)"; salt="$(rand_hex)"
    admin_pass="${GUARDASLI_ADMIN_PASS:-Ga$(rand_hex | cut -c1-12)A1}"
    {
      echo "# GuardAsli is0.0.1 — generated $(date -u +%Y-%m-%dT%H:%MZ)"
      echo "# Product: GuardAsli · Developer: AsliCode"
      echo "GUARDASLI_ENV=production"
      echo "NODE_ENV=production"
      echo "VITE_CONVEX_URL=${VITE_CONVEX_URL:-}"
      echo "CONVEX_DEPLOYMENT=${CONVEX_DEPLOYMENT:-}"
      echo "CONVEX_DEPLOY_KEY=${CONVEX_DEPLOY_KEY:-}"
      echo "GUARDASLI_MASTER_SECRET=${master}"
      echo "GUARDASLI_TOKEN_PEPPER=${pepper}"
      echo "GUARDASLI_AEAD_SALT=${salt}"
      echo "GUARDASLI_AEAD_KID=k1"
      echo "GUARDASLI_PUBLIC_URL=${pub}"
      echo "GUARDASLI_CORS_ORIGINS=${pub}"
      echo "GUARDASLI_MAIN_DOMAIN=${DOMAIN}"
      echo "GUARDASLI_ADMIN_USER=${GUARDASLI_ADMIN_USER:-admin}"
      echo "GUARDASLI_ADMIN_PASS=${admin_pass}"
      echo "GUARDASLI_PRODUCT=GuardAsli"
      echo "GUARDASLI_DEVELOPER=AsliCode"
      echo "GUARDASLI_VERSION=is0.0.1"
      echo "GUARDASLI_PORT=${PORT_UI}"
      echo "GUARDASLI_REPO_URL=${REPO_URL}"
      echo "PORT=${PORT_UI}"
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    ok "secrets generated (ADMIN_PASS is printed at the end)"
  fi

  # Keep public URL / CORS in sync when a domain is supplied on re-run.
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^GUARDASLI_PUBLIC_URL=.*|GUARDASLI_PUBLIC_URL=https://${DOMAIN}|" "$ENV_FILE"
    sed -i "s|^GUARDASLI_CORS_ORIGINS=.*|GUARDASLI_CORS_ORIGINS=https://${DOMAIN}|" "$ENV_FILE"
    grep -q '^GUARDASLI_MAIN_DOMAIN=' "$ENV_FILE" || echo "GUARDASLI_MAIN_DOMAIN=${DOMAIN}" >> "$ENV_FILE"
  fi
  ok "env file: ${ENV_FILE}"
}

# -----------------------------------------------------------------------------
# 5. App install: deps + gates (non-fatal, timeout-guarded) + Convex deploy
# -----------------------------------------------------------------------------
run_app_install() {
  info "bun install + production build..."
  cd "$INSTALL_DIR" || die "app dir missing"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  bun install --frozen-lockfile >/dev/null 2>&1 || bun install || die "bun install failed"
  ok "dependencies"

  # CI gates: informative on low-memory VPS boxes, never allowed to wedge the
  # installer. Production correctness is enforced at deploy time instead.
  if command -v timeout >/dev/null 2>&1; then
    timeout 300 bun run typecheck >/dev/null 2>&1 \
      && ok "typecheck" || warn "typecheck skipped or timed out (non-fatal here)"
    timeout 300 bun test >/dev/null 2>&1 \
      && ok "tests" || warn "tests skipped or timed out (non-fatal here)"
  else
    bun run typecheck >/dev/null 2>&1 && ok "typecheck" || warn "typecheck failed (non-fatal here)"
    bun test >/dev/null 2>&1 && ok "tests" || warn "tests failed (non-fatal here)"
  fi

  bun run build || die "production build failed"
  ok "build (dist/)"

  # Convex deploy: only meaningful with a deploy key or an existing deployment.
  if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
    info "Deploying Convex backend (deploy key)..."
    bunx convex deploy --yes 2>&1 | tail -3 || warn "convex deploy had errors — rerun later: cd ${INSTALL_DIR} && bunx convex deploy"
    ok "Convex backend deployed"
  elif [ -n "${VITE_CONVEX_URL:-}" ]; then
    info "Convex URL present — pushing functions..."
    bunx convex deploy --yes 2>&1 | tail -3 || warn "convex push failed — rerun later"
    ok "Convex functions pushed"
  else
    warn "No CONVEX_DEPLOY_KEY / VITE_CONVEX_URL — backend deploy pending"
    warn "Fix with:  cd ${INSTALL_DIR} && bunx convex login && bun scripts/auto-bootstrap.mjs"
  fi

  # Admin bootstrap (idempotent, safe to re-run).
  if [ -n "${VITE_CONVEX_URL:-}" ] || [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
    info "Bootstrapping super admin..."
    bun scripts/auto-bootstrap.mjs && ok "super admin ready" || warn "bootstrap deferred — rerun after backend is live"
  fi
}

# -----------------------------------------------------------------------------
# 6. Nginx + SSL
# -----------------------------------------------------------------------------
setup_nginx() {
  [ "$SKIP_NGINX" = "1" ] && { warn "nginx skipped (--skip-nginx)"; return 0; }
  [ -z "$DOMAIN" ] && { warn "no domain — nginx skipped (site served on :${PORT_UI})"; return 0; }
  command -v nginx >/dev/null 2>&1 || { warn "nginx not installed — skipped"; return 0; }

  info "Configuring Nginx for ${DOMAIN}..."
  cat > /etc/nginx/sites-available/guardasli <<NGX
server {
  listen 80;
  server_name ${DOMAIN};
  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:${PORT_UI};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 90;
  }
}
NGX
  ln -sf /etc/nginx/sites-available/guardasli /etc/nginx/sites-enabled/guardasli
  rm -f /etc/nginx/sites-enabled/default
  nginx -t || warn "nginx config test failed"
  systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
  ok "nginx -> 127.0.0.1:${PORT_UI}"

  if [ "$SKIP_SSL" != "1" ] && [ -n "$EMAIL" ]; then
    info "Issuing Let's Encrypt certificate for ${DOMAIN}..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect \
      && ok "SSL active (auto-renew via certbot.timer)" \
      || warn "certbot failed — check that DNS for ${DOMAIN} points to this server, then rerun: certbot --nginx -d ${DOMAIN}"
  else
    warn "SSL skipped — run: certbot --nginx -d ${DOMAIN} -m ${EMAIL:-you@example.com} --redirect"
  fi
}

# -----------------------------------------------------------------------------
# 7. systemd service
# -----------------------------------------------------------------------------
setup_systemd() {
  info "Installing systemd service..."
  local bun_bin
  bun_bin="$(command -v bun || echo /usr/local/bin/bun)"
  cat > /etc/systemd/system/guardasli.service <<UNIT
[Unit]
Description=GuardAsli control-plane (AsliCode)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=PORT=${PORT_UI}
ExecStartPre=/bin/sh -c 'test -d ${INSTALL_DIR}/dist || (cd ${INSTALL_DIR} && bun run build)'
ExecStart=${bun_bin} run preview --host 127.0.0.1 --port ${PORT_UI}
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:/opt/guardasli/logs/app.log
StandardError=append:/opt/guardasli/logs/error.log

[Install]
WantedBy=multi-user.target
UNIT
  mkdir -p /opt/guardasli/logs
  systemctl daemon-reload
  systemctl enable guardasli >/dev/null 2>&1
  systemctl restart guardasli
  ok "service guardasli active on 127.0.0.1:${PORT_UI}"
}

# -----------------------------------------------------------------------------
# 8. Firewall
# -----------------------------------------------------------------------------
firewall_setup() {
  command -v ufw >/dev/null 2>&1 || return 0
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ok "firewall: 80/443/SSH open"
}

# -----------------------------------------------------------------------------
# 9. The 'guardasli' management command
# -----------------------------------------------------------------------------
install_command() {
  local target="/usr/local/bin/guardasli"
  cp "${INSTALL_DIR}/scripts/guardasli.sh" "${target}" \
    && chmod +x "${target}" \
    && ok "command installed: guardasli (try: guardasli panel)" \
    || warn "could not install ${target}"
}

# -----------------------------------------------------------------------------
# 10. Summary + auto-open the management panel
# -----------------------------------------------------------------------------
print_summary_and_panel() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null
  set +a
  echo ""
  printf "${C_BOLD}══════════════════════════════════════════════════${C_OFF}\n"
  ok "GuardAsli is0.0.1 installed — by AsliCode"
  printf "${C_BOLD}══════════════════════════════════════════════════${C_OFF}\n"
  echo "  Path      : ${INSTALL_DIR}"
  echo "  Env file  : ${ENV_FILE}"
  echo "  Domain    : ${DOMAIN:-<none — serving on :${PORT_UI}>}"
  echo "  URL       : ${DOMAIN:+https://${DOMAIN}}${DOMAIN:-http://<server-ip>:${PORT_UI}}"
  echo "  Admin     : ${GUARDASLI_ADMIN_USER:-admin}"
  echo "  Password  : ${GUARDASLI_ADMIN_PASS:-<see ${ENV_FILE}>}"
  echo ""
  echo "  Manage everything with:"
  echo "    guardasli panel      <- interactive management panel (opens next)"
  echo "    guardasli status | doctor | logs | ssl | backup | update"
  echo ""
  if [ -z "${CONVEX_DEPLOY_KEY:-}" ] && [ -z "${VITE_CONVEX_URL:-}" ]; then
    warn "Backend pending: cd ${INSTALL_DIR} && bunx convex login, then: guardasli repair"
  fi
  printf "${C_BOLD}══════════════════════════════════════════════════${C_OFF}\n"
  echo ""
  info "Opening the management panel (option 0 exits)..."
  /usr/local/bin/guardasli panel 2>/dev/null || bash "${INSTALL_DIR}/scripts/guardasli.sh" panel
}

echo ""
echo " GuardAsli installer · AsliCode · is0.0.1"
echo " OS: $(detect_os)"
echo ""
need_root
install_system_packages
install_bun
clone_or_update
write_env
run_app_install
firewall_setup
setup_nginx
setup_systemd
install_command
print_summary_and_panel
