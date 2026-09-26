#!/usr/bin/env bash
# ============================================================================
#  GuardAsli — Main Installer & Control Panel
#  Developer: AsliCode          Version: is0.1.0
#  Format:    isMAJOR.MINOR.PATCH
#  Invoke with bash:  bash scripts/guardasli.sh <command>
# ============================================================================
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -uo pipefail

GUARDASLI_VERSION="is0.1.0"
GUARDASLI_PRODUCT="GuardAsli"
GUARDASLI_DEVELOPER="AsliCode"
GUARDASLI_ROOT="${GUARDASLI_ROOT:-/opt/guardasli}"
GUARDASLI_ENV_FILE="${GUARDASLI_ROOT}/.env"
GUARDASLI_LOG_DIR="${GUARDASLI_ROOT}/logs"
GUARDASLI_BACKUP_DIR="${GUARDASLI_ROOT}/backups"
GUARDASLI_APP_DIR="${GUARDASLI_ROOT}/app"
GUARDASLI_SERVICE="guardasli"

C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_BOLD='\033[1m'; C_OFF='\033[0m'
info()  { printf "${C_CYAN}[guardasli]${C_OFF} %s\n" "$*"; }
ok()    { printf "${C_GREEN}[  ok  ]${C_OFF} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[ warn ]${C_OFF} %s\n" "$*"; }
err()   { printf "${C_RED}[error ]${C_OFF} %s\n" "$*" >&2; }
die()   { err "$*"; exit 1; }
title() { printf "\n${C_BOLD}── %s ──\n" "$*"; }

# ----------------------------------------------------------------------------
# Environment file helpers
# ----------------------------------------------------------------------------
load_env() {
  [ -f "${GUARDASLI_ENV_FILE}" ] || return 0
  # shellcheck disable=SC1090
  set -a; . "${GUARDASLI_ENV_FILE}"; set +a
}

env_upsert() {
  local key="$1" val="$2"
  touch "${GUARDASLI_ENV_FILE}"
  if grep -qE "^${key}=" "${GUARDASLI_ENV_FILE}" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "${GUARDASLI_ENV_FILE}" && rm -f "${GUARDASLI_ENV_FILE}.bak"
  else
    printf '%s=%s\n' "${key}" "${val}" >> "${GUARDASLI_ENV_FILE}"
  fi
}

env_get() {
  local key="$1" dflt="${2:-}"
  [ -f "${GUARDASLI_ENV_FILE}" ] || { printf '%s' "${dflt}"; return; }
  local v
  v="$(grep -E "^${key}=" "${GUARDASLI_ENV_FILE}" | head -1 | cut -d= -f2-)"
  printf '%s' "${v:-${dflt}}"
}

# ----------------------------------------------------------------------------
# 0. System doctor
# ----------------------------------------------------------------------------
doctor_checks() {
  title "System checks"
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    ok "OS: ${PRETTY_NAME:-unknown}"
  else
    warn "/etc/os-release not found"
  fi
  ok "Architecture: $(uname -m)"
  ok "Kernel: $(uname -r)"
  command -v free >/dev/null 2>&1 && ok "RAM: $(( $(free | awk '/^Mem:/{print $2}') / 1024 )) MB"
  ok "CPU cores: $(nproc 2>/dev/null || echo '?')"
  DISK_MB="$(df -kP . 2>/dev/null | awk 'NR==2{print int($4/1024)}')"
  [ -n "${DISK_MB}" ] && ok "Disk free: ${DISK_MB} MB"
  [ "${DISK_MB:-0}" -lt 2048 ] && warn "Less than 2 GB free disk space"
  command -v curl >/dev/null 2>&1 && ok "curl: available" || warn "curl missing (required)"
  command -v openssl >/dev/null 2>&1 && ok "openssl: available" || warn "openssl missing (recommended for secrets)"
  if [ -n "$(env_get CONVEX_DEPLOY_KEY)" ]; then
    local m; m="$(env_get GUARDASLI_MASTER_SECRET)"
    if [ "${#m}" -ge 32 ]; then ok "GUARDASLI_MASTER_SECRET: present (${#m} chars)"
    else warn "GUARDASLI_MASTER_SECRET missing or too short — run: sudo guardasli convex"; fi
  else
    warn "No CONVEX_DEPLOY_KEY yet — backend not linked (menu 16)"
  fi
  if command -v ss >/dev/null 2>&1; then
    for p in 80 443; do
      if ss -ltn 2>/dev/null | grep -q ":${p} "; then warn "Port ${p} in use"; else ok "Port ${p} free"; fi
    done
  fi
}

# ----------------------------------------------------------------------------
# 1. Dependency installation
# ----------------------------------------------------------------------------
install_deps() {
  title "Installing dependencies"
  if command -v bun >/dev/null 2>&1; then
    ok "bun $(bun --version) already present"
  elif command -v apt-get >/dev/null 2>&1; then
    info "Using apt-get to bootstrap bun…"
    export DEBIAN_FRONTEND=noninteractive
    ${SUDO:-} apt-get update -y >/dev/null 2>&1 || true
    ${SUDO:-} apt-get install -y curl unzip ca-certificates >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    ${SUDO:-} dnf install -y curl unzip >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    ${SUDO:-} yum install -y curl unzip >/dev/null 2>&1 || true
  fi
  if ! command -v bun >/dev/null 2>&1; then
    info "Downloading bun…"
    curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 \
      || die "bun installation failed — install bun manually and re-run"
    export BUN_INSTALL="${HOME}/.bun"
    export PATH="${BUN_INSTALL}/bin:${PATH}"
  fi
  ok "bun $(bun --version) ready"
  command -v git >/dev/null 2>&1 || warn "git not found — required for updates"
}

# ----------------------------------------------------------------------------
# 2. Generate secrets
# ----------------------------------------------------------------------------
gen_master_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n'
  fi
}

ensure_master_secret() {
  local current
  current="$(env_get GUARDASLI_MASTER_SECRET)"
  if [ -z "${current}" ]; then
    env_upsert GUARDASLI_MASTER_SECRET "$(gen_master_secret)"
    ok "GUARDASLI_MASTER_SECRET generated (48-byte base64)"
  else
    ok "GUARDASLI_MASTER_SECRET already present"
  fi
}

# ----------------------------------------------------------------------------
# 3. Source deployment (git or local copy)
# ----------------------------------------------------------------------------
deploy_source() {
  title "Deploying application source"
  mkdir -p "${GUARDASLI_ROOT}" "${GUARDASLI_APP_DIR}" "${GUARDASLI_LOG_DIR}" "${GUARDASLI_BACKUP_DIR}"
  if [ -f package.json ] && [ -f src/convex/schema.ts ]; then
    info "Installing from current directory…"
    rsync -a --delete \
      --exclude node_modules --exclude .git --exclude dist \
      --exclude .env --exclude .env.local \
      ./ "${GUARDASLI_APP_DIR}/" 2>/dev/null \
      || cp -r ./ "${GUARDASLI_APP_DIR}/"
  elif [ -n "$(env_get GUARDASLI_REPO_URL)" ] && command -v git >/dev/null 2>&1; then
    local repo
    repo="$(env_get GUARDASLI_REPO_URL)"
    if [ -d "${GUARDASLI_APP_DIR}/.git" ]; then
      git -C "${GUARDASLI_APP_DIR}" fetch --all >/dev/null 2>&1 || true
      git -C "${GUARDASLI_APP_DIR}" reset --hard origin/main >/dev/null 2>&1 || true
    else
      git clone --depth 1 "${repo}" "${GUARDASLI_APP_DIR}" \
        || die "git clone failed for ${repo}"
    fi
  else
    die "No local source and no GUARDASLI_REPO_URL configured"
  fi
  ok "Source at ${GUARDASLI_APP_DIR}"
}

# ----------------------------------------------------------------------------
# 4. Application build
# ----------------------------------------------------------------------------
build_app() {
  title "Building application"
  (
    cd "${GUARDASLI_APP_DIR}" || die "app dir missing"
    export GUARDASLI_MASTER_SECRET="$(env_get GUARDASLI_MASTER_SECRET)"
    bun install >/dev/null 2>&1 || die "bun install failed"
    info "bun install complete"
    bun run build >/dev/null 2>&1 || die "vite build failed"
    info "Frontend build complete (dist/)"
    bun convex deploy 2>/dev/null \
      || info "Convex deploy skipped (no deployment linked in this environment)"
  )
  ok "Build finished"
}

# ----------------------------------------------------------------------------
# 5. Service management (systemd preferred, nohup fallback)
# ----------------------------------------------------------------------------
svc_unit() {
  cat <<EOF
[Unit]
Description=${GUARDASLI_PRODUCT} control-plane · Coded by ${GUARDASLI_DEVELOPER}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${GUARDASLI_APP_DIR}
EnvironmentFile=${GUARDASLI_ENV_FILE}
ExecStart=$(command -v bun) run dev
Restart=always
RestartSec=5
StandardOutput=append:${GUARDASLI_LOG_DIR}/app.log
StandardError=append:${GUARDASLI_LOG_DIR}/error.log

[Install]
WantedBy=multi-user.target
EOF
}

svc_install() {
  title "Installing service"
  if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
    svc_unit | ${SUDO:-} tee "/etc/systemd/system/${GUARDASLI_SERVICE}.service" >/dev/null
    ${SUDO:-} systemctl daemon-reload
    ${SUDO:-} systemctl enable "${GUARDASLI_SERVICE}" >/dev/null 2>&1 || true
    ok "systemd unit installed (${GUARDASLI_SERVICE}.service)"
  else
    warn "systemd not available — using nohup fallback"
    svc_start_nohup
  fi
}

svc_start_nohup() {
  (
    cd "${GUARDASLI_APP_DIR}" || exit 1
    set -a; . "${GUARDASLI_ENV_FILE}"; set +a
    nohup bun run dev >> "${GUARDASLI_LOG_DIR}/app.log" 2>&1 &
  )
  ok "Started via nohup (log: ${GUARDASLI_LOG_DIR}/app.log)"
}

svc_start() {
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "^${GUARDASLI_SERVICE}.service"; then
    ${SUDO:-} systemctl restart "${GUARDASLI_SERVICE}"
    ok "Service restarted"
  else
    svc_start_nohup
  fi
}

svc_stop() {
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "^${GUARDASLI_SERVICE}.service"; then
    ${SUDO:-} systemctl stop "${GUARDASLI_SERVICE}"
    ok "Service stopped"
  else
    pkill -f "bun run dev" 2>/dev/null && ok "Stopped nohup process" || warn "No process found"
  fi
}

svc_status() {
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "^${GUARDASLI_SERVICE}.service"; then
    systemctl status "${GUARDASLI_SERVICE}" --no-pager -l | head -12
  else
    if pgrep -f "bun run dev" >/dev/null 2>&1; then
      ok "Running (nohup)"
    else
      warn "Not running"
    fi
  fi
}

# ----------------------------------------------------------------------------
# 6. SSL (self-signed bootstrap + ACME wildcard guidance)
# ----------------------------------------------------------------------------
# ── nginx: یک منبع حقیقت ───────────────────────────────────────────────────
# scripts/nginx-render.sh پورت‌های نقش را می‌سازد، TLS را روی هر سه فعال
# می‌کند، فایروال را باز می‌کند و اگر nginx -t شکست بخورد برمی‌گردد.
nginx_apply() {
  local domain; domain="$(env_get GUARDASLI_MAIN_DOMAIN)"
  [ -z "${domain}" ] && { warn "no domain configured (guardasli reconfigure)"; return 1; }
  local port_ui; port_ui="$(env_get GUARDASLI_PORT 4173)"
  local port_r; port_r="$(env_get GUARDASLI_PORT_RESELLER 105)"
  local port_s; port_s="$(env_get GUARDASLI_PORT_SUPER 616)"
  local script="${GUARDASLI_APP_DIR}/scripts/nginx-render.sh"
  if [ ! -f "${script}" ]; then
    # اسکریپت همراه خودِ نسخه‌ی جدیدِ guardasli (وقتی از سورس جدید اجرا می‌شود)
    script="$(cd "$(dirname "$0")" && pwd)/nginx-render.sh"
  fi
  if [ ! -f "${script}" ]; then
    # آخرین تلاش: خودِ اسکریپت را از ریپو بگیر (بدون نیاز به آپدیت کامل)
    script="${GUARDASLI_ROOT}/.nginx-render.sh"
    local repo; repo="$(env_get GUARDASLI_REPO_URL '')"
    if [ -n "${repo}" ] && command -v curl >/dev/null 2>&1; then
      curl -fsSL --max-time 30 "${repo%.git}/raw/main/scripts/nginx-render.sh" -o "${script}" 2>/dev/null || true
    fi
  fi
  [ -f "${script}" ] || { warn "nginx-render.sh not found — run: guardasli update"; return 1; }
  GA_DOMAIN="${domain}" GA_PORT_UI="${port_ui}" \
  GA_PORT_RESELLER="${port_r}" GA_PORT_SUPER="${port_s}" \
  GA_TLS="${1:-auto}" bash "${script}"
}

# تشخیص کامل پورت‌های نقش — دقیقاً می‌گوید کجا گیر کرده است.
check_ports() {
  title "Role login ports"
  local domain; domain="$(env_get GUARDASLI_MAIN_DOMAIN)"
  local port_r; port_r="$(env_get GUARDASLI_PORT_RESELLER 105)"
  local port_s; port_s="$(env_get GUARDASLI_PORT_SUPER 616)"
  if [ -z "${domain}" ]; then
    warn "no domain configured — set it with: guardasli reconfigure"
    return 1
  fi
  ok "domain: ${domain}"
  ok "reseller port: ${port_r} · super admin port: ${port_s}"

  # ۱) آیا nginx بلوک‌ها را دارد؟
  if grep -q "listen ${port_r};" /etc/nginx/sites-available/guardasli 2>/dev/null; then
    ok "nginx config has port ${port_r}"
  else
    warn "nginx config is MISSING port ${port_r} — fixing now"
    nginx_apply >/dev/null 2>&1 || warn "could not write the nginx config"
  fi
  if grep -q "listen ${port_s};" /etc/nginx/sites-available/guardasli 2>/dev/null; then
    ok "nginx config has port ${port_s}"
  else
    warn "nginx config is MISSING port ${port_s} — fixing now"
    nginx_apply >/dev/null 2>&1 || warn "could not write the nginx config"
  fi

  # ۲) آیا nginx واقعاً روی آن پورت‌ها گوش می‌دهد؟
  if command -v ss >/dev/null 2>&1; then
    for p in "${port_r}" "${port_s}"; do
      if ss -ltn 2>/dev/null | grep -q ":${p} "; then
        ok "listening on ${p}"
      else
        warn "NOT listening on ${p} — nginx may need: systemctl reload nginx"
      fi
    done
  fi

  # ۳) TLS روی پورت‌ها هست یا نه؟
  local scheme="http"
  if [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
    scheme="https"
    ok "certificate present — HTTPS expected on every role port"
  else
    warn "no certificate yet — role ports are HTTP only. Run: guardasli ssl"
  fi

  # ۴) تست واقعی از خود سرور
  for p in "" "${port_r}" "${port_s}"; do
    local url="${scheme}://${domain}${p:+:${p}}/nginx-health"
    if curl -k -fsS --max-time 10 "${url}" 2>/dev/null | grep -q ok; then
      ok "live: ${url}"
    else
      warn "not answering: ${url}"
    fi
  done
  echo ""
  info "Open these in the browser:"
  echo "  users     : ${scheme}://${domain}/"
  echo "  reseller  : ${scheme}://${domain}:${port_r}/"
  echo "  super     : ${scheme}://${domain}:${port_s}/"
}

ssl_issue() {
  title "SSL setup"
  # nginx-render.sh ممکن است هنوز در نسخه‌ی قدیمی موجود نباشد؛ از پوشه‌ی
  # جدیدِ اپ استفاده کن وگرنه بعد از آپدیت خودبه‌خود کپی می‌شود.
  local domain email
  domain="$(env_get GUARDASLI_MAIN_DOMAIN)"
  [ -z "${domain}" ] && die "Set GUARDASLI_MAIN_DOMAIN first (menu: 2 Reconfigure)"
  email="$(env_get GUARDASLI_ACME_EMAIL '')"
  if [ -z "${email}" ]; then
    printf "Email for the SSL certificate: "
    read -r email
    [ -n "${email}" ] && env_upsert GUARDASLI_ACME_EMAIL "${email}"
  fi
  # پیش‌نیاز چالش webroot: پوشه با مالکیت مناسب + مسیر روی ۸۰ باز باشد.
  if [ -n "${email}" ]; then
    ${SUDO:-} mkdir -p /var/www/html/.well-known/acme-challenge
    ${SUDO:-} chmod 755 /var/www/html /var/www/html/.well-known /var/www/html/.well-known/acme-challenge 2>/dev/null || true
    # رندر HTTP-only قبل از certbot تا چالش روی ۸۰ پاس شود؛ TLS بعدش فعال می‌شود.
    nginx_apply 0 >/dev/null 2>&1 || true
    info "Issuing certificate for ${domain} (webroot challenge)..."
    local out
    out="$(${SUDO:-} certbot certonly --webroot -w /var/www/html -d "${domain}" \
      --non-interactive --agree-tos -m "${email}" --keep-until-expiring 2>&1)" || {
      printf '%s\n' "${out}" | tail -5 >&2
      warn "certbot failed — see the lines above. Checklist:"
      warn "  1) DNS A record of ${domain} points to this server (dig +short ${domain})"
      warn "  2) port 80 open and reachable:   curl -I http://${domain}/"
      warn "  3) rerun:  sudo guardasli ssl"
      return 1
    }
    ok "certificate ready for ${domain}"
    if nginx_apply 1 >/dev/null 2>&1; then
      ok "SSL active on the main site AND both role ports (105 / 616)"
      # دامنه https شد — GUARDASLI_PUBLIC_URL باید https باشد وگرنه تلگرام
      # webhook را (که فقط https می‌پذیرد) ست نمی‌کند.
      env_upsert GUARDASLI_PUBLIC_URL "https://${domain}"
      env_upsert GUARDASLI_CORS_ORIGINS "https://${domain}"
      ok "GUARDASLI_PUBLIC_URL -> https://${domain} (rerun sync-env or 'sudo guardasli convex' to apply on the backend)"
    else
      warn "certificate issued but TLS config failed — rerun: guardasli ssl"
    fi
  else
    info "No email given — issuing a self-signed certificate instead."
    info "Telegram requires a trusted certificate; with self-signed the bot will NOT work."
    mkdir -p "${GUARDASLI_ROOT}/ssl"
    info "Generating self-signed certificate for ${domain} (valid 825 days)"
    openssl req -x509 -newkey rsa:4096 -sha256 -days 825 -nodes \
      -keyout "${GUARDASLI_ROOT}/ssl/privkey.pem" \
      -out "${GUARDASLI_ROOT}/ssl/fullchain.pem" \
      -subj "/CN=${domain}" \
      -addext "subjectAltName=DNS:${domain},DNS:*.${domain}" 2>/dev/null \
      || die "openssl certificate generation failed"
    ok "Certificate: ${GUARDASLI_ROOT}/ssl/fullchain.pem"
    warn "Self-signed — for production install certbot (apt install certbot python3-certbot-nginx) and rerun: guardasli ssl"
  fi
  env_upsert GUARDASLI_SSL_DIR "${GUARDASLI_ROOT}/ssl"
}

# ----------------------------------------------------------------------------
# 7. Telegram bot config
# ----------------------------------------------------------------------------
telegram_setup() {
  title "Telegram bot"
  info "The token is stored encrypted (AES-256-GCM) in the database and the"
  info "webhook is registered on Telegram right here — fully automatic."
  local key; key="$(env_get CONVEX_DEPLOY_KEY)"
  [ -z "${key}" ] && { warn "No CONVEX_DEPLOY_KEY — run: sudo guardasli convex  first"; return 1; }
  printf "Bot token from @BotFather (blank to skip): "
  read -r TOK
  [ -z "${TOK}" ] && { info "Skipped"; return 0; }
  printf "Bot admin numeric Telegram ID (get it from @userinfobot; blank = first /admin claims): "
  read -r ADMIN_ID
  [ -n "${ADMIN_ID}" ] && ! [[ "${ADMIN_ID}" =~ ^[0-9]{4,20}$ ]] && { err "admin ID must be numeric (e.g. 123456789)"; return 1; }
  (
    cd "${GUARDASLI_APP_DIR}" || exit 1
    export CONVEX_DEPLOY_KEY="${key}"
    local admin_json="null"
    [ -n "${ADMIN_ID}" ] && admin_json="${ADMIN_ID}"
    if GUARDASLI_BOT_TOKEN="${TOK}" GUARDASLI_BOT_ADMIN_ID="${ADMIN_ID}" \
      bun scripts/bot-bootstrap.mjs 2>&1 | tail -15; then
      ok "Bot configured — send /start in Telegram to test it"
    else
      warn "bootstrap failed — check the token value and that the backend is live"
    fi
  )
}

# ----------------------------------------------------------------------------
# 8. First admin bootstrap
# ----------------------------------------------------------------------------
bootstrap_admin() {
  title "Bootstrap super admin"
  local user pass
  printf "Admin username [admin]: "
  read -r user
  user="${user:-admin}"
  while :; do
    printf "Admin password (min 8 chars): "
    read -rs pass; echo
    [ "${#pass}" -ge 8 ] && break
    warn "Password too short"
  done
  (
    cd "${GUARDASLI_APP_DIR}" || exit 1
    export GUARDASLI_MASTER_SECRET="$(env_get GUARDASLI_MASTER_SECRET)"
    bunx convex run authActions:bootstrapAdminAction \
      "{\"username\":\"${user}\",\"password\":\"${pass}\"}" 2>/dev/null \
      && ok "Super admin '${user}' created" \
      || warn "Convex not linked yet — run this again after 'bun convex dev --once'"
  )
  env_upsert GUARDASLI_ADMIN_USER "${user}"
}

# ----------------------------------------------------------------------------
# 9. Backup / restore
# ----------------------------------------------------------------------------
do_backup() {
  title "Backup"
  mkdir -p "${GUARDASLI_BACKUP_DIR}"
  local stamp f
  stamp="$(date +%Y%m%d%H%M%S)"
  f="${GUARDASLI_BACKUP_DIR}/guardasli-${stamp}.tar.gz"
  tar -czf "${f}" \
    -C "$(dirname "${GUARDASLI_ENV_FILE}")" "$(basename "${GUARDASLI_ENV_FILE}")" \
    -C "${GUARDASLI_ROOT}" ssl 2>/dev/null
  if command -v bun >/dev/null 2>&1 && [ -d "${GUARDASLI_APP_DIR}" ]; then
    (cd "${GUARDASLI_APP_DIR}" && bunx convex export --path "${GUARDASLI_BACKUP_DIR}/db-${stamp}.zip" >/dev/null 2>&1) \
      && ok "Database export saved" || warn "Database export skipped (convex not linked)"
  fi
  ok "Backup: ${f}"
  local keep=14
  ls -1t "${GUARDASLI_BACKUP_DIR}"/guardasli-*.tar.gz 2>/dev/null | tail -n +$((keep + 1)) | while read -r old; do
    rm -f "${old}"
  done
}

do_restore() {
  title "Restore"
  local f="${1:-}"
  [ -z "${f}" ] && die "Usage: guardasli restore <backup.tar.gz>"
  [ -f "${f}" ] || die "File not found: ${f}"
  warn "Current state will be overwritten. Continue? (yes/no)"
  read -r CONFIRM
  [ "${CONFIRM}" = "yes" ] || { info "Cancelled"; return; }
  do_backup
  tar -xzf "${f}" -C "${GUARDASLI_ROOT}" && ok "Archive restored"
  svc_start
  ok "Restore complete — verify with 'guardasli status'"
}

# ----------------------------------------------------------------------------
# 10. Full install pipeline
# ----------------------------------------------------------------------------
do_install() {
  printf "\n%s\n" "${C_BOLD}GuardAsli installer v${GUARDASLI_VERSION} — Coded by ${GUARDASLI_DEVELOPER}${C_OFF}"
  doctor_checks
  install_deps
  mkdir -p "${GUARDASLI_ROOT}"
  if [ ! -f "${GUARDASLI_ENV_FILE}" ]; then
    cat > "${GUARDASLI_ENV_FILE}" <<EOF
GUARDASLI_PRODUCT=${GUARDASLI_PRODUCT}
GUARDASLI_DEVELOPER=${GUARDASLI_DEVELOPER}
GUARDASLI_VERSION=${GUARDASLI_VERSION}
GUARDASLI_MAIN_DOMAIN=
GUARDASLI_REPO_URL=
GUARDASLI_MASTER_SECRET=
EOF
    chmod 600 "${GUARDASLI_ENV_FILE}"
    ok "Environment file created: ${GUARDASLI_ENV_FILE}"
  fi
  ensure_master_secret
  deploy_source
  build_app
  svc_install
  svc_start
  printf "\n"
  ok "Installation complete"
  info "Next steps:"
  info "  1. guardasli reconfigure   — set domain, repo URL"
  info "  2. guardasli ssl           — issue TLS certificate"
  info "  3. guardasli admin         — create first super admin"
  info "  4. guardasli panel         — open the management panel"
}

# ----------------------------------------------------------------------------
# 11. Reconfigure
# ----------------------------------------------------------------------------
do_reconfigure() {
  title "Reconfigure"
  printf "Main domain [%s]: " "$(env_get GUARDASLI_MAIN_DOMAIN)"
  read -r D
  [ -n "${D}" ] && env_upsert GUARDASLI_MAIN_DOMAIN "${D}"
  # دامنه → PUBLIC_URL همیشه https می‌شود (تلگرام فقط https می‌پذیرد).
  # بدون دامنه → همان IP عمومی با پورت اپ.
  if [ -n "${D}" ]; then
    env_upsert GUARDASLI_PUBLIC_URL "https://${D}"
    env_upsert GUARDASLI_CORS_ORIGINS "https://${D}"
  fi
  printf "SSL email (Let's Encrypt) [%s]: " "$(env_get GUARDASLI_ACME_EMAIL '')"
  read -r E
  [ -n "${E}" ] && env_upsert GUARDASLI_ACME_EMAIL "${E}"
  printf "Repo URL (for updates) [%s]: " "$(env_get GUARDASLI_REPO_URL)"
  read -r R
  [ -n "${R}" ] && env_upsert GUARDASLI_REPO_URL "${R}"
  printf "HTTP port [%s]: " "$(env_get GUARDASLI_PORT 3000)"
  read -r P
  [ -n "${P}" ] && env_upsert GUARDASLI_PORT "${P}"
  # Server IP is re-detected automatically — never asked, never a loopback/link-local value.
  local ip=""
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
  if [ -z "${ip}" ] || [ "${ip%%.*}" = "127" ] || [ "${ip%%.*}" = "169" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i !~ /^169\.254\./ && $i !~ /^127\./){print $i; exit}}')"
  fi
  if [ -n "${ip}" ] && { [ "${ip%%.*}" = "127" ] || [ "${ip%%.*}" = "169" ]; }; then ip=""; fi
  if [ -n "${ip}" ]; then
    env_upsert GUARDASLI_SERVER_IP "${ip}"
    # فقط وقتی دامنه‌ای نیست، fallback روی http+IP می‌گذاریم.
    if [ -z "${D}" ] && [ -z "$(env_get GUARDASLI_MAIN_DOMAIN)" ]; then
      env_upsert GUARDASLI_PUBLIC_URL "http://${ip}:$(env_get GUARDASLI_PORT 3000)"
      env_upsert GUARDASLI_CORS_ORIGINS "http://${ip}:$(env_get GUARDASLI_PORT 3000)"
      warn "No domain — Telegram webhook will NOT work with http://IP (https required)."
    fi
    ok "Server IP detected: ${ip}"
  fi
  ok "Configuration saved"
}

# ----------------------------------------------------------------------------
# 12. Update / repair
# ----------------------------------------------------------------------------
do_update() {
  title "Update"
  deploy_source
  # build_app شامل bun install + vite build + convex deploy است؛ بدون convex
  # deploy توابع بک‌اند قدیمی می‌مانند و ربات/پنل بعد از آپدیت می‌شکنند.
  build_app
  svc_start
  # nginx هم باید تازه شود وگرنه پورت‌های نقش (105/616) که در نسخه‌های
  # قبلی نبودند هرگز ساخته نمی‌شوند — دلیل «پورت کار نمی‌کند».
  nginx_apply || warn "nginx not updated — run: guardasli ports"
  # خودِ دستور guardasli هم باید تازه شود (دسترس به زیر‌دستور جدید)
  install_command >/dev/null 2>&1 || true
  local url="$(env_get VITE_CONVEX_URL '')"
  if [ -n "${url}" ]; then
    info "Live check: ${url}/api/v1/health"
    if curl -fsS --max-time 20 "${url}/api/v1/health" 2>/dev/null | grep -q '"database":"ok"'; then
      ok "backend healthy after update"
    else
      warn "backend health pending — test: curl ${url}/api/v1/health"
    fi
  fi
  ok "Update complete — version ${GUARDASLI_VERSION}"
}

do_repair() {
  title "Repair"
  install_deps
  build_app
  svc_start
  ok "Repair complete"
}

# ----------------------------------------------------------------------------
# 13. Status / logs / uninstall
# ----------------------------------------------------------------------------
do_status() {
  title "Status"
  ok "Product:   ${GUARDASLI_PRODUCT}"
  ok "Developer: ${GUARDASLI_DEVELOPER}"
  ok "Version:   ${GUARDASLI_VERSION} (isMAJOR.MINOR.PATCH)"
  ok "Root:      ${GUARDASLI_ROOT}"
  ok "App:       ${GUARDASLI_APP_DIR}"
  ok "Domain:    $(env_get GUARDASLI_MAIN_DOMAIN '(not set)')"
  ok "Port:      $(env_get GUARDASLI_PORT 3000)"
  svc_status
  [ -f "${GUARDASLI_ROOT}/ssl/fullchain.pem" ] && ok "SSL:       installed" || warn "SSL:       not configured"
  local n
  n="$(ls -1 "${GUARDASLI_BACKUP_DIR}"/guardasli-*.tar.gz 2>/dev/null | wc -l)"
  ok "Backups:   ${n} archive(s)"
}

do_logs() {
  title "Logs (last 50 lines)"
  tail -n 50 "${GUARDASLI_LOG_DIR}/app.log" 2>/dev/null || warn "No app log yet"
  tail -n 20 "${GUARDASLI_LOG_DIR}/error.log" 2>/dev/null || true
}

do_uninstall() {
  title "Uninstall"
  warn "This removes ${GUARDASLI_ROOT} including database exports and certificates!"
  printf "Type 'yes' to confirm: "
  read -r CONFIRM
  [ "${CONFIRM}" = "yes" ] || { info "Cancelled"; return; }
  svc_stop
  command -v systemctl >/dev/null 2>&1 && ${SUDO:-} systemctl disable "${GUARDASLI_SERVICE}" >/dev/null 2>&1
  ${SUDO:-} rm -f "/etc/systemd/system/${GUARDASLI_SERVICE}.service"
  rm -rf "${GUARDASLI_ROOT}"
  ok "Uninstalled"
}

convex_deploy() {
  title "Convex backend deploy"
  (
    cd "${GUARDASLI_APP_DIR}" || exit 1
    set -a; . "${GUARDASLI_ENV_FILE}" 2>/dev/null; set +a
    if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
      info "Deploy key present — deploying"
    else
      warn "No CONVEX_DEPLOY_KEY in ${GUARDASLI_ENV_FILE}"
      info "Copy the FULL key from dashboard.convex.dev > your project > Settings > Deploy Keys"
      info "It includes the deployment prefix, like:  prod:your-deployment|eyJ2MiI6..."
      printf "Paste the full deploy key (blank to abort): "
      read -r KEY
      [ -z "${KEY}" ] && { info "Aborted"; return; }
      case "${KEY}" in
        dev:*|prod:*) [ "${KEY}" = "${KEY%%|*}" ] && { err "incomplete key — the 'prod:name|token' part before '|' is missing"; return; } ;;
        *) err "key must start with 'prod:' or 'dev:' — a bare token is not accepted"; return ;;
      esac
      env_upsert CONVEX_DEPLOY_KEY "${KEY}"
      export CONVEX_DEPLOY_KEY="${KEY}"
      local dname="${KEY%%|*}"; dname="${dname#*:}"
      # VITE_CONVEX_URL must be .convex.cloud — the browser client rejects .convex.site
      env_upsert VITE_CONVEX_URL "https://${dname}.convex.cloud"
      export VITE_CONVEX_URL="https://${dname}.convex.cloud"
    fi
    if bunx convex deploy --yes 2>&1 | tail -5; then
      ok "Convex backend deployed"
      # The deployment needs its own env — without GUARDASLI_MASTER_SECRET the
      # bot token can't be decrypted and setWebhook always fails.
      # One source of truth: scripts/sync-convex-env.mjs (bun run sync-env).
      if bun run sync-env >/dev/null 2>&1; then
        ok "deployment env synced (bot/webhook secrets ready)"
      else
        warn "deployment env sync incomplete — bot/webhook needs GUARDASLI_MASTER_SECRET on the deployment"
        warn "retry with:  cd ${GUARDASLI_APP_DIR} && bun run sync-env"
      fi
      local base="${VITE_CONVEX_URL:-}"
      if [ -n "${base}" ]; then
        sleep 3
        if curl -fsS --max-time 20 "${base}/api/v1/health" 2>/dev/null | grep -q '"database":"ok"'; then
          ok "live check passed: ${base}/api/v1/health (database ok)"
        else
          warn "live check pending — test in a minute: curl ${base}/api/v1/health"
        fi
      fi
      bun scripts/auto-bootstrap.mjs 2>/dev/null && ok "super admin ensured" || true
      ${SUDO:-} systemctl restart "${GUARDASLI_SERVICE}" 2>/dev/null || true
    else
      warn "deploy failed — verify the key with: bunx convex deploy --yes"
    fi
  )
  svc_start
}

show_admin_info() {
  title "Admin credentials"
  local user pass
  user="$(env_get GUARDASLI_ADMIN_USER admin)"
  pass="$(env_get GUARDASLI_ADMIN_PASS '')"
  ok "Username: ${user}"
  if [ -n "${pass}" ]; then
    ok "Password: ${pass}"
  else
    warn "No password stored — reset it with menu 5 (Create super admin)"
  fi
  ok "URL: $(env_get GUARDASLI_PUBLIC_URL "http://$(env_get GUARDASLI_SERVER_IP '<server-ip>'):$(env_get GUARDASLI_PORT 3000)")"
  warn "Keep these credentials private — stored in ${GUARDASLI_ENV_FILE} (mode 600)"
}

# ----------------------------------------------------------------------------
# 14. Management panel (interactive TUI)
# ----------------------------------------------------------------------------
do_panel() {
  while :; do
    printf "\n"
    printf "${C_BOLD}╔══════════════════════════════════════════════╗${C_OFF}\n"
    printf "${C_BOLD}║  %s — Management Panel  v%s  ║${C_OFF}\n" "${GUARDASLI_PRODUCT}" "${GUARDASLI_VERSION}"
    printf "${C_BOLD}║  Coded by ${GUARDASLI_DEVELOPER}                       ║${C_OFF}\n"
    printf "${C_BOLD}╠══════════════════════════════════════════════╣${C_OFF}\n"
    printf "║  1) Install (full pipeline)                  ║\n"
    printf "║  2) Reconfigure (domain, repo, port)         ║\n"
    printf "║  3) SSL certificate                          ║\n"
    printf "║  4) Telegram bot setup                       ║\n"
    printf "║  5) Create super admin                       ║\n"
    printf "║  6) Start service                            ║\n"
    printf "║  7) Stop service                             ║\n"
    printf "║  8) Service status                           ║\n"
    printf "║  9) Update                                   ║\n"
    printf "║ 10) Repair                                   ║\n"
    printf "║ 11) Backup now                               ║\n"
    printf "║ 12) Restore backup                           ║\n"
    printf "║ 13) Logs                                     ║\n"
    printf "║ 14) Doctor (system checks)                   ║\n"
    printf "║ 15) Status                                   ║\n"
    printf "║ 16) Convex backend deploy                    ║\n"
    printf "║ 17) Admin credentials                        ║\n"
    printf "║ 18) Install 'guardasli' command              ║\n"
    printf "║ 19) Check role login ports (105 / 616)        ║\n"
    printf "║  0) Exit                                     ║\n"
    printf "${C_BOLD}╚══════════════════════════════════════════════╝${C_OFF}\n"
    printf "Select: "
    read -r CH
    case "${CH}" in
      1) do_install ;;
      2) do_reconfigure ;;
      3) ssl_issue ;;
      4) telegram_setup ;;
      5) bootstrap_admin ;;
      6) svc_start ;;
      7) svc_stop ;;
      8) svc_status ;;
      9) do_update ;;
      10) do_repair ;;
      11) do_backup ;;
      12) do_restore ;;
      13) do_logs ;;
      14) doctor_checks ;;
      15) do_status ;;
      16) convex_deploy ;;
      17) show_admin_info ;;
      18) install_command ;;
      19) check_ports ;;
      0) printf "\n"; break ;;
      *) warn "Invalid choice" ;;
    esac
  done
}

# ----------------------------------------------------------------------------
# Command dispatch + guardasli command installation
# ----------------------------------------------------------------------------
install_command() {
  local target="/usr/local/bin/guardasli"
  if [ -w /usr/local/bin ] || [ "$(id -u)" = "0" ]; then
    cp "$0" "${target}" && chmod +x "${target}" && ok "Command installed: guardasli"
  else
    ${SUDO:-} cp "$0" "${target}" && ${SUDO:-} chmod +x "${target}" \
      && ok "Command installed: guardasli" \
      || warn "Could not install to ${target} — run with sudo or invoke via: sh $0"
  fi
}

check_deployment_env() {
  title "Deployment environment (Convex)"
  local key; key="$(env_get CONVEX_DEPLOY_KEY)"
  if [ -z "${key}" ]; then
    warn "No CONVEX_DEPLOY_KEY in ${GUARDASLI_ENV_FILE} — run: sudo guardasli convex"
    return 1
  fi
  ( cd "${GUARDASLI_APP_DIR}" 2>/dev/null || exit 1
    export CONVEX_DEPLOY_KEY="${key}"
    local out; out="$(bunx convex env list 2>/dev/null || true)"
    local n
    for n in GUARDASLI_MASTER_SECRET GUARDASLI_AEAD_SALT GUARDASLI_PUBLIC_URL; do
      if printf '%s' "${out}" | grep -q "^${n}="; then
        ok "deployment env: ${n} set"
      else
        warn "deployment env: ${n} MISSING — fix with: bun run sync-env"
      fi
    done
  )
}

case "${1:-}" in
  install)  do_install ;;
  panel)    do_panel ;;
  admin)    bootstrap_admin ;;
  ssl)      ssl_issue ;;
  nginx)    nginx_apply && ok "nginx applied" ;;
  ports)    check_ports ;;
  env)      check_deployment_env ;;
  webhook)
    info "Webhook is automatic: it re-registers daily via the built-in cron."
    info "Force it now from the admin panel → Bot tab → Set webhook (leave the field blank)."
    check_deployment_env
    ;;
  telegram) telegram_setup ;;
  start)    svc_start ;;
  stop)     svc_stop ;;
  status)   do_status ;;
  logs)     do_logs ;;
  update)   do_update ;;
  repair)   do_repair ;;
  backup)   do_backup ;;
  restore)  shift; do_restore "$@" ;;
  doctor)   doctor_checks ;;
  reconfigure) do_reconfigure ;;
  install-command) install_command ;;
  version)  echo "GuardAsli ${GUARDASLI_VERSION} (isMAJOR.MINOR.PATCH) · Coded by ${GUARDASLI_DEVELOPER}" ;;
  "")       do_panel ;;
  *)        err "Unknown command: $1"; echo "Commands: install panel admin ssl telegram start stop status logs update repair backup restore doctor reconfigure version install-command"; exit 1 ;;
esac
