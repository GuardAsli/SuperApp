#!/usr/bin/env bash
# GuardAsli — brings up everything automatically after the wizard
# Product: GuardAsli · Developer: AsliCode · Powered By AsliCode
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info() { printf "\033[1;36m[GuardAsli]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[OK]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }

if [ ! -f "$ROOT/.env.local" ]; then
  info "no env — running the wizard..."
  bash "$ROOT/scripts/wizard.sh"
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local" 2>/dev/null || true
set +a

# Sync env to Convex
bun "$ROOT/scripts/sync-convex-env.mjs" 2>/dev/null || true

# If no URL yet, try codegen once
if [ -z "${VITE_CONVEX_URL:-}" ]; then
  warn "VITE_CONVEX_URL is empty — trying codegen"
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
  warn "still no URL. Run these two once (first time only):"
  echo "  bunx convex login"
  echo "  bunx convex dev"
  echo "then run again: bun run up"
  exit 1
fi

ok "Convex URL: ${VITE_CONVEX_URL}"

# bootstrap
bun "$ROOT/scripts/auto-bootstrap.mjs" || warn "bootstrap — ignored if already created"

# Run together: convex dev (if needed) + vite
info "UI on http://127.0.0.1:5173"

# Parallel convex dev when the user sets CONVEX_RUN_BACKEND=1
if [ "${CONVEX_RUN_BACKEND:-1}" = "1" ]; then
  info "starting convex dev in the background..."
  bunx convex dev --once 2>/dev/null || true
  # push functions
  (bunx convex dev >> "$ROOT/.guardasli-convex.log" 2>&1 &) || true
  sleep 2
fi

export PORT="${PORT:-5173}"
exec bun run dev
