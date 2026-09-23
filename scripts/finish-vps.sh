#!/usr/bin/env bash
# GuardAsli — finish installation after Convex login / domain setup
# Product: GuardAsli · Developer: AsliCode · Powered By AsliCode
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:/usr/local/bin:$PATH"

info() { printf "\033[1;36m[GuardAsli]\033[0m %s\n" "$*"; }
ok() { printf "\033[1;32m[OK]\033[0m %s\n" "$*"; }

set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local" 2>/dev/null || true
set +a

info "Convex deploy + env sync..."
if [ -n "${CONVEX_DEPLOY_KEY:-}" ] || [ -n "${VITE_CONVEX_URL:-}" ]; then
  bunx convex deploy --yes 2>/dev/null || bunx convex deploy || true
else
  bunx convex deploy --yes 2>/dev/null || bunx convex deploy || true
fi

bun "$ROOT/scripts/sync-convex-env.mjs" || true
info "Bootstrap..."
bun "$ROOT/scripts/auto-bootstrap.mjs" || true

bun run build
systemctl restart guardasli 2>/dev/null || true
ok "finish-vps complete"
