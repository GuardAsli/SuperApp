#!/usr/bin/env bash
# GuardAsli — مانیتور لاگ و سلامت Convex + اپ
# Product: GuardAsli · Developer: AsliCode
#
# usage:
#   bash scripts/monitor-convex.sh           # یک‌بار خلاصه
#   bash scripts/monitor-convex.sh --follow  # دنبال کردن مداوم
#   bash scripts/monitor-convex.sh --jobs    # وضعیت صف jobs
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:/usr/local/bin:$PATH"

FOLLOW=0
JOBS=0
for a in "$@"; do
  case "$a" in
    --follow|-f) FOLLOW=1 ;;
    --jobs|-j) JOBS=1 ;;
  esac
done

if [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local" 2>/dev/null || true
  set +a
fi

info() { printf "\033[1;36m[monitor]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ok]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }

summary() {
  echo "════════ GuardAsli monitor $(date -u +%Y-%m-%dT%H:%MZ) ════════"
  # systemd app
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet guardasli 2>/dev/null; then
      ok "systemd guardasli: active"
    else
      warn "systemd guardasli: $(systemctl is-active guardasli 2>/dev/null || echo n/a)"
    fi
  fi

  # local UI port
  PORT_UI="${PORT:-4173}"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -q ":${PORT_UI} "; then
      ok "UI listen :${PORT_UI}"
    else
      warn "UI port ${PORT_UI} not listening"
    fi
  fi

  # nginx
  if command -v nginx >/dev/null 2>&1; then
    if systemctl is-active --quiet nginx 2>/dev/null; then
      ok "nginx active"
      if [ -f /var/log/nginx/guardasli.error.log ]; then
        ERR_N="$(tail -n 200 /var/log/nginx/guardasli.error.log 2>/dev/null | grep -c error || true)"
        info "nginx error lines (last 200 scanned): ${ERR_N}"
      fi
    else
      warn "nginx inactive"
    fi
  fi

  # Convex URL
  if [ -n "${VITE_CONVEX_URL:-}" ]; then
    ok "VITE_CONVEX_URL set"
    # ping open deployment HTTP if site URL derived is hard; just show
    info "convex: ${VITE_CONVEX_URL}"
  else
    warn "VITE_CONVEX_URL empty"
  fi

  # recent app journal
  if command -v journalctl >/dev/null 2>&1; then
    info "last guardasli logs:"
    journalctl -u guardasli -n 15 --no-pager 2>/dev/null || true
  fi

  # local convex log file if any
  if [ -f "$ROOT/.guardasli-convex.log" ]; then
    info "tail .guardasli-convex.log:"
    tail -n 20 "$ROOT/.guardasli-convex.log" || true
  fi

  if [ "$JOBS" = "1" ]; then
    info "job queue snapshot (convex run)…"
    bunx convex run infra:jobStatsInternal '{}' 2>/dev/null \
      || bun "$ROOT/scripts/convex-job-stats.mjs" 2>/dev/null \
      || warn "job stats unavailable — deploy latest functions"
  fi
  echo "════════════════════════════════════════════════"
}

if [ "$FOLLOW" = "1" ]; then
  summary
  info "following: journalctl + nginx error + convex log"
  # parallel tails
  (journalctl -u guardasli -f 2>/dev/null &) || true
  (tail -F /var/log/nginx/guardasli.error.log 2>/dev/null &) || true
  (tail -F "$ROOT/.guardasli-convex.log" 2>/dev/null &) || true
  wait
else
  summary
fi
