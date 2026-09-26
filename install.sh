#!/usr/bin/env bash
# =============================================================================
#  GuardAsli — server installer (English only for SSH)
#  Product:    GuardAsli
#  Developer:  AsliCode · Coded by AsliCode
#  Release:    is0.0.2   (format isMAJOR.MINOR.PATCH)
#
#  One command — opens the installer straight away:
#    sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh)"
#
#  Or from a checkout:
#    sudo bash install.sh
#    sudo bash install.sh --domain panel.example.com --email admin@example.com
#    sudo bash install.sh --deploy-key 'prod:name|eyJ...'   <- non-interactive backend
#
#  What it does:
#    system packages -> bun -> source -> secrets -> install -> backend deploy
#    -> build -> live health verify -> admin bootstrap -> Nginx -> SSL
#    -> systemd service -> firewall -> 'guardasli' command -> management panel
#
#  The Convex deploy key is OPTIONAL. Leave it empty and the installer
#  continues happily; you can connect the backend later with:
#    sudo guardasli convex
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
SKIP_CONVEX="${GUARDASLI_SKIP_CONVEX:-0}"
PORT_UI="${GUARDASLI_PORT:-4173}"
# Role entry points — the login page for each role lives on its own port.
PORT_SUPER="${GUARDASLI_PORT_SUPER:-616}"
PORT_RESELLER="${GUARDASLI_PORT_RESELLER:-105}"
DEPLOY_KEY="${CONVEX_DEPLOY_KEY:-}"
SERVER_IP=""
OPEN_PANEL="${GUARDASLI_OPEN_PANEL:-1}"
BACKGROUND=0
# Keep the default non-interactive when stdin is not a terminal.
if [ ! -t 0 ]; then OPEN_PANEL=0; fi

wizard() {
  echo ""
  echo "  GuardAsli installer — Coded by AsliCode"
  echo "  Press Enter to accept the default shown in [brackets]."
  echo ""
  if [ -z "${DOMAIN}" ]; then
    printf "Domain for the panel, e.g. panel.example.com [none — server IP will be used]: "
    read -r DOMAIN
  fi
  if [ -n "${DOMAIN}" ] && [ -z "${EMAIL}" ]; then
    printf "Email for the SSL certificate (Let's Encrypt): "
    read -r EMAIL
  fi
  if [ -z "${PORT_UI}" ] || [ "${PORT_UI}" = "4173" ]; then
    printf "Internal web port [4173]: "
    read -r P
    PORT_UI="${P:-4173}"
  fi
  ask_deploy_key
  echo ""
  info "Starting install${DOMAIN:+ for ${DOMAIN}}..."
  echo ""
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)  DOMAIN="$2";  shift 2 ;;
    --email)   EMAIL="$2";   shift 2 ;;
    --dir)     INSTALL_DIR="$2"; STATE_DIR="$(dirname "$2")"; shift 2 ;;
    --port)    PORT_UI="$2"; shift 2 ;;
    --repo)    REPO_URL="$2"; shift 2 ;;
    --skip-ssl)   SKIP_SSL=1; shift ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --skip-convex) SKIP_CONVEX=1; shift ;;
    --deploy-key) DEPLOY_KEY="$2"; shift 2 ;;
    --background|-b) BACKGROUND=1; OPEN_PANEL=0; shift ;;
    --port-super) PORT_SUPER="$2"; shift 2 ;;
    --port-reseller) PORT_RESELLER="$2"; shift 2 ;;
    --yes|-y)  shift ;;
    --help|-h) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_BOLD='\033[1m'; C_OFF='\033[0m'
info() { printf "${C_CYAN}[GuardAsli]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ OK ]${C_OFF} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[WARN]${C_OFF} %s\n" "$*"; }
die()  { printf "${C_RED}[FAIL]${C_OFF} %s\n" "$*" >&2; exit 1; }

# ── Install log ─────────────────────────────────────────────────────────────
# Every step writes here AND to the terminal. If the SSH session dies the log
# survives, so an interrupted install can always be inspected and re-run.
INSTALL_LOG="${STATE_DIR}/install.log"
CURRENT_STEP="startup"
log_line() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >>"$INSTALL_LOG" 2>/dev/null || true; }

step() {
  CURRENT_STEP="$1"
  info "$1"
  log_line "=== STEP: $1 ==="
}

step_ok()   { ok "$*";   log_line "OK: $*"; }
step_warn() { warn "$*"; log_line "WARN: $*"; }

# On any failure: say WHERE, and that re-running is safe (all steps idempotent).
on_error() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    printf "${C_RED}[FAIL]${C_OFF} step '%s' failed (exit %s)\n" "$CURRENT_STEP" "$code" >&2
    log_line "FAILED at step '$CURRENT_STEP' (exit $code)"
    printf "  Log     : %s\n" "$INSTALL_LOG" >&2
    printf "  Resume  : re-run the same command — completed steps are skipped.\n" >&2
    printf "  Follow  : tail -f %s\n" "$INSTALL_LOG" >&2
  fi
}
trap on_error EXIT

have_timeout() { command -v timeout >/dev/null 2>&1; }

# run_step <seconds> <label> <command...>
# Live output (no more silent minutes), a hard timeout, and a log line — a slow
# network can never freeze the terminal again.
run_step() {
  local limit="$1" label="$2"; shift 2
  log_line "run: $label (timeout ${limit}s)"
  local started; started="$(date +%s)"
  if have_timeout; then
    timeout --foreground -k 10 "$limit" "$@" 2>&1 | tee -a "$INSTALL_LOG" | sed 's/^/    /'
    local rc=${PIPESTATUS[0]}
  else
    "$@" 2>&1 | tee -a "$INSTALL_LOG" | sed 's/^/    /'
    local rc=${PIPESTATUS[0]}
  fi
  local took=$(( $(date +%s) - started ))
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    step_warn "${label} exceeded ${limit}s and was stopped (after ${took}s) — continuing"
    return 124
  fi
  if [ "$rc" -ne 0 ]; then
    step_warn "${label} failed (exit ${rc}, ${took}s)"
    return "$rc"
  fi
  step_ok "${label} (${took}s)"
  return 0
}

# A 512MB–2GB VPS has no swap: `vite build` makes the kernel OOM killer shoot
# the shell, which looks exactly like "the terminal died mid-install".
ensure_swap() {
  local mem_mb
  mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  [ -n "$mem_mb" ] && [ "$mem_mb" -gt 0 ] || return 0
  if [ "$mem_mb" -ge 3072 ]; then
    step_ok "memory ${mem_mb} MB — no swap needed"
    return 0
  fi
  if swapon --show 2>/dev/null | grep -q .; then
    step_ok "swap already active"
    return 0
  fi
  step_warn "only ${mem_mb} MB RAM — adding 2 GB swap so the build cannot be OOM-killed"
  if ! swapon --show 2>/dev/null | grep -q . && [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile 2>/dev/null || true
    mkswap /swapfile >/dev/null 2>&1 || true
  fi
  swapon /swapfile 2>/dev/null || true
  # Keep it across reboots.
  if ! grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab 2>/dev/null || true
  fi
  # Lower swappiness so the swap is a safety net, not the main memory.
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-guardasli-swap.conf 2>/dev/null || true
  sysctl -p /etc/sysctl.d/99-guardasli-swap.conf >/dev/null 2>&1 || true
  step_ok "swap active (2 GB)"
}

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

# Server public IPv4 — from the default-route interface, never a loopback address.
detect_public_ip() {
  local ip=""
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
  if [ -z "$ip" ] || [ "${ip%%.*}" = "127" ] || [ "${ip%%.*}" = "169" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i !~ /^169\.254\./ && $i !~ /^127\./){print $i; exit}}')"
  fi
  if [ -n "$ip" ] && { [ "${ip%%.*}" = "127" ] || [ "${ip%%.*}" = "169" ]; }; then ip=""; fi
  [ -n "$ip" ] && { echo "$ip"; return; }
  # Last resort: external echo (no key material sent — plain IP discovery).
  ip="$(curl -4 -fs --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  echo "${ip:-}"
}

# -----------------------------------------------------------------------------
# 1. System packages
# -----------------------------------------------------------------------------
install_system_packages() {
  step "Installing system packages"
  local id
  id="$(detect_os | awk '{print $1}')"
  case "$id" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      # needrestart must never open an interactive TUI mid-install.
      echo 'needrestart_conf->{ui} = "0";' > /etc/needrestart/conf.d/guardasli-noninteractive.conf 2>/dev/null || true
      run_step 420 "apt-get update" apt-get update -y || true
      run_step 600 "apt-get install" apt-get install -y \
        -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
        curl ca-certificates git unzip openssl nginx certbot python3-certbot-nginx ufw rsync \
        || true
      rm -f /etc/needrestart/conf.d/guardasli-noninteractive.conf 2>/dev/null || true
      ;;
    centos|rhel|rocky|almalinux|fedora)
      if command -v dnf >/dev/null 2>&1; then
        run_step 600 "dnf install" dnf install -y curl ca-certificates git unzip openssl nginx certbot python3-certbot-nginx rsync || true
      else
        run_step 600 "yum install" yum install -y curl ca-certificates git unzip openssl nginx rsync || true
      fi
      ;;
    *) step_warn "unrecognized OS '${id}' — package install skipped" ;;
  esac
  step_ok "system packages"
}

# -----------------------------------------------------------------------------
# 2. Bun
# -----------------------------------------------------------------------------
install_bun() {
  if command -v bun >/dev/null 2>&1; then step_ok "bun $(bun --version) present"; return; fi
  step "Installing bun"
  # Download first, then run: a stalled download can no longer hang the install.
  local script="${STATE_DIR}/bun-install.sh"
  if ! run_step 180 "download bun installer" curl -fsSL --retry 3 --retry-delay 2 \
        --connect-timeout 15 --max-time 150 https://bun.sh/install -o "$script"; then
    step_warn "could not download the bun installer — check your network, then re-run"
    return 1
  fi
  if ! run_step 180 "install bun" bash "$script"; then
    step_warn "bun install script failed"
    return 1
  fi
  rm -f "$script"
  export PATH="${HOME}/.bun/bin:${PATH}"
  if [ -x "${HOME}/.bun/bin/bun" ]; then
    ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
    ln -sf "${HOME}/.bun/bin/bunx" /usr/local/bin/bunx 2>/dev/null || true
  fi
  command -v bun >/dev/null 2>&1 || { step_warn "bun is still not on PATH — install manually"; return 1; }
  step_ok "bun $(bun --version)"
}

# -----------------------------------------------------------------------------
# 3. Source
# -----------------------------------------------------------------------------
clone_or_update() {
  step "Fetching source -> ${INSTALL_DIR}"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [ -d "$INSTALL_DIR/.git" ]; then
    run_step 300 "git fetch" git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" || true
    run_step 60 "git checkout" git -C "$INSTALL_DIR" checkout -f "$BRANCH" || true
  else
    rm -rf "$INSTALL_DIR"
    if ! run_step 600 "git clone ${REPO_URL}" \
          git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"; then
      step_warn "git clone failed — check your network or the repo URL, then re-run"
      return 1
    fi
  fi
  step_ok "source ready"
}

# -----------------------------------------------------------------------------
# 4. Secrets + env  (single env file shared with the 'guardasli' manager)
# -----------------------------------------------------------------------------
write_env() {
  info "Writing configuration and secrets..."
  SERVER_IP="$(detect_public_ip)"
  [ -n "$SERVER_IP" ] && ok "server public IP: ${SERVER_IP}"
  local pub backend_url
  if [ -n "$DOMAIN" ]; then
    pub="https://${DOMAIN}"
  elif [ -n "$SERVER_IP" ]; then
    pub="http://${SERVER_IP}:${PORT_UI}"
  else
    pub=""
  fi

  # With a full deploy key the backend endpoints are known without contacting
  # the cloud. VITE_CONVEX_URL MUST be the .convex.cloud address — the browser
  # ConvexReactClient refuses .convex.site (that host serves HTTP actions only,
  # not the websocket sync the dashboard needs) and crashes the site.
  backend_url=""
  if valid_deploy_key "${DEPLOY_KEY}"; then
    local dname="${DEPLOY_KEY%%|*}"; dname="${dname#*:}"
    backend_url="https://${dname}.convex.cloud"
  fi

  if [ -f "$ENV_FILE" ] && grep -q '^GUARDASLI_MASTER_SECRET=.' "$ENV_FILE" 2>/dev/null; then
    ok "existing secrets preserved"
    # Re-run: refresh key/url if newly supplied.
    if valid_deploy_key "${DEPLOY_KEY}"; then
      sed -i "s|^CONVEX_DEPLOY_KEY=.*|CONVEX_DEPLOY_KEY=${DEPLOY_KEY}|" "$ENV_FILE"
      sed -i "s|^VITE_CONVEX_URL=.*|VITE_CONVEX_URL=${backend_url}|" "$ENV_FILE"
    fi
  else
    local master pepper salt admin_pass
    master="$(rand_hex)"; pepper="$(rand_hex)"; salt="$(rand_hex)"
    admin_pass="${GUARDASLI_ADMIN_PASS:-Ga$(rand_hex | cut -c1-12)A1}"
    {
      echo "# GuardAsli is0.0.2 — generated $(date -u +%Y-%m-%dT%H:%MZ)"
      echo "# Product: GuardAsli · Developer: AsliCode"
      echo "GUARDASLI_ENV=production"
      echo "NODE_ENV=production"
      echo "VITE_CONVEX_URL=${backend_url}"
      echo "CONVEX_DEPLOYMENT=${DEPLOY_KEY%%|*}"
      echo "CONVEX_DEPLOY_KEY=${DEPLOY_KEY}"
      echo "GUARDASLI_MASTER_SECRET=${master}"
      echo "GUARDASLI_TOKEN_PEPPER=${pepper}"
      echo "GUARDASLI_AEAD_SALT=${salt}"
      echo "GUARDASLI_AEAD_KID=k1"
      echo "GUARDASLI_PUBLIC_URL=${pub}"
      echo "GUARDASLI_CORS_ORIGINS=${pub}"
      echo "GUARDASLI_MAIN_DOMAIN=${DOMAIN}"
      echo "GUARDASLI_SERVER_IP=${SERVER_IP}"
      echo "GUARDASLI_ADMIN_USER=${GUARDASLI_ADMIN_USER:-admin}"
      echo "GUARDASLI_ADMIN_PASS=${admin_pass}"
      echo "GUARDASLI_PRODUCT=GuardAsli"
      echo "GUARDASLI_DEVELOPER=AsliCode"
      echo "GUARDASLI_VERSION=is0.0.2"
      echo "GUARDASLI_PORT=${PORT_UI}"
      echo "GUARDASLI_PORT_SUPER=${PORT_SUPER}"
      echo "GUARDASLI_PORT_RESELLER=${PORT_RESELLER}"
      echo "GUARDASLI_REPO_URL=${REPO_URL}"
      echo "PORT=${PORT_UI}"
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    ok "secrets generated (ADMIN_PASS is printed at the end)"
  fi

  # Keep public URL / CORS in sync when a domain or IP is supplied on re-run.
  if [ -n "$pub" ]; then
    sed -i "s|^GUARDASLI_PUBLIC_URL=.*|GUARDASLI_PUBLIC_URL=${pub}|" "$ENV_FILE"
    sed -i "s|^GUARDASLI_CORS_ORIGINS=.*|GUARDASLI_CORS_ORIGINS=${pub}|" "$ENV_FILE"
    grep -q '^GUARDASLI_MAIN_DOMAIN=' "$ENV_FILE" || echo "GUARDASLI_MAIN_DOMAIN=${DOMAIN}" >> "$ENV_FILE"
  fi
  grep -q '^GUARDASLI_SERVER_IP=' "$ENV_FILE" || echo "GUARDASLI_SERVER_IP=${SERVER_IP}" >> "$ENV_FILE"
  ok "env file: ${ENV_FILE}"
}

# -----------------------------------------------------------------------------
# 5. App install: deps + gates (non-fatal, timeout-guarded) + Convex deploy
# -----------------------------------------------------------------------------
run_app_install() {
  step "Application install (dependencies, checks, build)"
  cd "$INSTALL_DIR" || die "app dir missing"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  # Previously silent (`>/dev/null`) for minutes — that silence is what looked
  # like a hang. Live output + hard timeout instead.
  if ! run_step 600 "bun install" bun install --frozen-lockfile; then
    run_step 600 "bun install (no lockfile)" bun install \
      || { step_warn "dependency install failed — re-run the installer"; return 1; }
  fi

  # Quality gates stay non-fatal here, but are visible and time-boxed.
  run_step 240 "typecheck" bun run typecheck || step_warn "typecheck did not pass (non-fatal during install)"
  run_step 240 "tests" bun test || step_warn "tests did not pass (non-fatal during install)"

  if ! run_step 600 "production build (vite)" bun run build; then
    step_warn "production build failed — re-run the installer to retry"
    return 1
  fi

  # Backend deploy — OPTIONAL. An empty key configures later; it never blocks.
  step "Backend deploy"
  if [ "$SKIP_CONVEX" = "1" ]; then
    step_warn "backend deploy skipped (--skip-convex)"
  elif valid_deploy_key "${CONVEX_DEPLOY_KEY:-}"; then
    info "Deploying backend to the cloud deployment (${CONVEX_DEPLOY_KEY%%|*})..."
    local deploy_out
    deploy_out="$(bunx convex deploy --yes 2>&1)" || {
      printf '%s\n' "${deploy_out}" | tail -8 | sed 's/^/    /'
      log_line "convex deploy FAILED: $(printf '%s' "${deploy_out}" | tail -3)"
      # خطاهای شایع کلید — پیام اقدام‌پذیر به‌جای سکوت
      if printf '%s' "${deploy_out}" | grep -qi "unauthorized\|invalid.*key\|deploy key"; then
        step_warn "the deploy key was rejected — copy the FULL key (prod:name|eyJ...) from dashboard.convex.dev → Settings → Deploy Keys"
      elif printf '%s' "${deploy_out}" | grep -qi "network\|ENOTFOUND\|timeout"; then
        step_warn "network error reaching the cloud — check connectivity, then rerun the installer"
      else
        step_warn "convex deploy failed — full error above; retry later: cd ${INSTALL_DIR} && bunx convex deploy --yes"
      fi
      return 0
    }
    printf '%s\n' "${deploy_out}" | tail -3 | sed 's/^/    /'
    step_ok "backend deployed"
    # The Convex deployment reads its OWN env (process.env inside actions);
    # the shell env file does NOT reach it. Without GUARDASLI_MASTER_SECRET
    # there, the bot token cannot be decrypted and setWebhook always fails.
    # One source of truth: scripts/sync-convex-env.mjs (bun run sync-env).
    if run_step 180 "deployment env sync" bun scripts/sync-convex-env.mjs; then
      step_ok "deployment env synced (bot/webhook secrets ready)"
    else
      step_warn "deployment env sync incomplete — bot/webhook needs GUARDASLI_MASTER_SECRET"
      step_warn "retry with:  cd ${INSTALL_DIR} && bun scripts/sync-convex-env.mjs"
    fi
    verify_backend_live "${VITE_CONVEX_URL:-}"
  elif [ -n "${VITE_CONVEX_URL:-}" ]; then
    info "Convex URL present without key — trying function push..."
    run_step 420 "convex deploy (no key)" bunx convex deploy --yes \
      || step_warn "push failed — a full deploy key is required"
  else
    step_warn "No deploy key given — backend NOT deployed"
    step_warn "Re-run the installer, or:  sudo guardasli convex   (asks for the key)"
  fi

  # Admin bootstrap (idempotent, safe to re-run).
  if [ -n "${VITE_CONVEX_URL:-}" ] && [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
    run_step 120 "bootstrap super admin" bun scripts/auto-bootstrap.mjs \
      && step_ok "super admin ready" \
      || step_warn "bootstrap deferred — rerun after backend is live"
  fi
}

# Live proof the cloud backend answers: /api/v1/health must say database ok.
verify_backend_live() {
  local base="${1:-}"
  [ -n "$base" ] || { warn "no backend URL to verify"; return 1; }
  info "Verifying live backend at ${base}..."
  local body i
  for i in 1 2 3 4 5; do
    body="$(curl -fsS --max-time 20 "${base}/api/v1/health" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q '"database":"ok"'; then
      ok "backend live — database ok (${base}/api/v1/health)"
      return 0
    fi
    [ "$i" -lt 5 ] && { info "retry ${i}/5 (fresh deployment can take a minute)..."; sleep 12; }
  done
  warn "health check did not confirm yet: ${body:-<no answer>}"
  warn "test later: curl ${base}/api/v1/health   — expect \"database\":\"ok\""
  return 1
}

# -----------------------------------------------------------------------------
# 6. Nginx + SSL
# -----------------------------------------------------------------------------
setup_nginx() {
  [ "$SKIP_NGINX" = "1" ] && { step_warn "nginx skipped (--skip-nginx)"; return 0; }
  [ -z "$DOMAIN" ] && { step_warn "no domain — nginx skipped (site served on :${PORT_UI})"; return 0; }
  command -v nginx >/dev/null 2>&1 || { step_warn "nginx not installed — skipped"; return 0; }

  # One renderer for every path (install / update / ssl) so the role ports can
  # never be lost. It also opens the ports in the firewall and rolls back on a
  # failed `nginx -t`.
  nginx_apply() {
    GA_DOMAIN="${DOMAIN}" \
    GA_PORT_UI="${PORT_UI}" \
    GA_PORT_RESELLER="${PORT_RESELLER}" \
    GA_PORT_SUPER="${PORT_SUPER}" \
    GA_TLS="${1:-auto}" \
    bash "${INSTALL_DIR}/scripts/nginx-render.sh" 2>&1 | tee -a "$INSTALL_LOG" | sed 's/^/    /'
  }

  step "Configuring Nginx for ${DOMAIN}"
  if ! nginx_apply auto; then
    step_warn "nginx configuration failed — the previous config was restored"
    return 0
  fi
  step_ok "nginx ready: ${DOMAIN} (user) · :${PORT_RESELLER} (reseller) · :${PORT_SUPER} (super admin)"

  if [ "$SKIP_SSL" != "1" ] && [ -n "$EMAIL" ]; then
    step "Issuing SSL certificate"
    # certonly + webroot: certbot never rewrites our config, so the role ports
    # keep their own blocks and we can switch TLS on for all three ourselves.
    if run_step 300 "certbot (webroot)" certbot certonly --webroot -w /var/www/html \
          -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring; then
      step_ok "certificate issued for ${DOMAIN}"
      # Re-render WITH TLS: this is what actually makes https://domain:616 work.
      if nginx_apply 1; then
        step_ok "HTTPS active on all role ports"
      else
        step_warn "could not enable TLS on the role ports — HTTP still works"
      fi
    else
      step_warn "certbot failed — check that DNS for ${DOMAIN} points to this server"
      step_warn "then run:  sudo guardasli ssl"
    fi
  else
    step_warn "SSL skipped — run: sudo guardasli ssl"
    log_line "role ports are currently HTTP only until SSL is issued"
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
  # Role login pages.
  ufw allow "${PORT_RESELLER}/tcp" >/dev/null 2>&1 || true
  ufw allow "${PORT_SUPER}/tcp" >/dev/null 2>&1 || true
  ufw allow OpenSSH >/dev/null 2>&1 || true
  step_ok "firewall: 80/443/${PORT_RESELLER}/${PORT_SUPER}/SSH open"
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
  ok "GuardAsli is0.0.2 installed — Coded by AsliCode"
  printf "${C_BOLD}══════════════════════════════════════════════════${C_OFF}\n"
  echo "  Path      : ${INSTALL_DIR}"
  echo "  Env file  : ${ENV_FILE}"
  echo "  Log       : ${INSTALL_LOG}"
  echo "  Domain    : ${DOMAIN:-<none>}${SERVER_IP:+  ·  IP: ${SERVER_IP}}"
  echo "  URL       : ${DOMAIN:+https://${DOMAIN}}${DOMAIN:-http://${SERVER_IP:-<server-ip>}:${PORT_UI}}"
  if [ -n "${DOMAIN:-}" ]; then
    echo "  Users     : https://${DOMAIN}/                 (normal user login)"
    echo "  Reseller  : https://${DOMAIN}:${PORT_RESELLER}/          (reseller login)"
    echo "  SuperAdmin: https://${DOMAIN}:${PORT_SUPER}/           (super admin login)"
  fi
  echo "  Backend   : ${VITE_CONVEX_URL:-<not deployed — no deploy key>}${CONVEX_DEPLOY_KEY:+ }"
  echo "  Admin     : ${GUARDASLI_ADMIN_USER:-admin}"
  echo "  Password  : ${GUARDASLI_ADMIN_PASS:-<see ${ENV_FILE}>}"
  echo ""
  echo "  Manage everything with:"
  echo "    guardasli panel      <- interactive management panel"
  echo "    guardasli status | doctor | logs | ssl | backup | update | env"
  echo ""
  if [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
    step_warn "Backend pending: re-run installer with the deploy key, or: sudo guardasli convex"
  fi
  printf "${C_BOLD}══════════════════════════════════════════════════${C_OFF}\n"
  echo ""
  # The management panel is a nested TUI. Launching it from a non-interactive
  # session (CI, piped curl|bash, a dying SSH) leaves the user staring at a
  # frozen-looking screen — so only open it on a real terminal.
  if [ "${OPEN_PANEL:-1}" = "1" ] && [ -t 0 ] && [ -t 1 ]; then
    info "Opening the management panel (choose 0 to exit)..."
    /usr/local/bin/guardasli panel 2>/dev/null || bash "${INSTALL_DIR}/scripts/guardasli.sh" panel
  else
    info "Management panel not opened (non-interactive session)."
    info "Start it any time with:  sudo guardasli panel"
  fi
}

# Full Convex deploy key: required, must carry the deployment prefix and a
# pipe separator (prod:name|token). Not the bare token — the CLI refuses it.
valid_deploy_key() {
  case "$1" in
    dev:*|prod:*) [ "$1" != "${1%%|*}" ] ;;
    *) return 1 ;;
  esac
}

# One quiet attempt. Empty input is ACCEPTED — the key is optional and the
# backend can be connected afterwards with 'sudo guardasli convex'.
ask_deploy_key_once() {
  printf "Convex deploy key (optional — Enter to skip, configure later): "
  read -r DEPLOY_KEY
}

ask_deploy_key() {
  # Already supplied via --deploy-key or env: validate quietly, no reprompt loop.
  if [ -n "${DEPLOY_KEY}" ]; then
    if valid_deploy_key "${DEPLOY_KEY}"; then
      ok "deploy key accepted (${DEPLOY_KEY%%|*})"
    else
      warn "key format unexpected — continuing anyway (installer will retry at deploy step)"
    fi
    return 0
  fi
  ask_deploy_key_once
  if [ -z "${DEPLOY_KEY}" ]; then
    ok "no deploy key — backend can be connected later with: sudo guardasli convex"
    return 0
  fi
  if valid_deploy_key "${DEPLOY_KEY}"; then
    ok "deploy key accepted (${DEPLOY_KEY%%|*})"
  else
    warn "key format unexpected — continuing anyway (installer will retry at deploy step)"
  fi
}

echo ""
echo " GuardAsli installer · AsliCode · is0.0.2"
echo " OS: $(detect_os)"
echo ""
need_root

# ── Survive a dropped connection ────────────────────────────────────────────
# An install can take several minutes. With --background the script re-executes
# itself under setsid+nohup, so closing the terminal (or losing SSH) no longer
# kills the install — it keeps writing to install.log.
if [ "$BACKGROUND" = "1" ] && [ "${GA_BACKGROUND_CHILD:-}" != "1" ]; then
  # GA_BACKGROUND_CHILD guard: بدون این، فرزند هم --background را می‌گرفت و
  # دوباره خودش را fork می‌کرد — حلقه‌ی بی‌نهایت (fork bomb).
  mkdir -p "$STATE_DIR"
  LOG="${STATE_DIR}/install.log"
  SELF="${STATE_DIR}/install.sh"
  cp -f "${BASH_SOURCE[0]}" "$SELF" 2>/dev/null || SELF="${BASH_SOURCE[0]}"
  ARGS=()
  for a in "$@"; do [ "$a" = "--background" ] || [ "$a" = "-b" ] || ARGS+=("$a"); done
  if GA_BACKGROUND_CHILD=1 setsid nohup bash "$SELF" "${ARGS[@]}" >>"$LOG" 2>&1 </dev/null & then
    echo " Install continues in the background."
    echo "   follow : tail -f $LOG"
    echo "   check  : $SELF status  (once finished)"
    exit 0
  fi
  echo " Could not detach; continuing in this session." >&2
  BACKGROUND=0
fi

mkdir -p "$STATE_DIR" "${STATE_DIR}/logs"
touch "$INSTALL_LOG" 2>/dev/null || true
chmod 600 "$INSTALL_LOG" 2>/dev/null || true
log_line "### GuardAsli installer started (branch=${BRANCH}, dir=${INSTALL_DIR})"

ensure_swap
wizard
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
log_line "### installer finished"
