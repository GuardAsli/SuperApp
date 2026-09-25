#!/usr/bin/env bash
# GuardAsli is0.0.1 — reliable production start path with a strict env gate
# Product: GuardAsli · Developer: AsliCode · Powered By AsliCode
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[guardasli] release check…"
bun "$ROOT/scripts/release-check.mjs"

echo "[guardasli] install…"
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  bun install --frozen-lockfile || bun install
else
  bun install
fi

echo "[guardasli] ci…"
bun run ci

# ── Production env hard gate ──
export GUARDASLI_ENV="${GUARDASLI_ENV:-production}"
export NODE_ENV="${NODE_ENV:-production}"

fail=0
need() {
  local name="$1" min="${2:-1}"
  local val="${!name:-}"
  if [ -z "$val" ] || [ "${#val}" -lt "$min" ]; then
    echo "[guardasli] ERR: $name is required (min $min characters)"
    fail=1
  fi
}

need GUARDASLI_MASTER_SECRET 32
need GUARDASLI_TOKEN_PEPPER 16
need GUARDASLI_AEAD_SALT 16
need GUARDASLI_CORS_ORIGINS 8
need GUARDASLI_PUBLIC_URL 12

if echo "${GUARDASLI_CORS_ORIGINS:-}" | grep -q '\*'; then
  echo "[guardasli] ERR: CORS must not contain *"
  fail=1
fi

if [[ "${GUARDASLI_PUBLIC_URL:-}" != https://* ]]; then
  echo "[guardasli] ERR: GUARDASLI_PUBLIC_URL must start with https://"
  fail=1
fi

if [ -n "${VITE_GUARDASLI_MASTER_SECRET:-}" ] || [ -n "${VITE_GUARDASLI_TOKEN_PEPPER:-}" ]; then
  echo "[guardasli] ERR: secrets in VITE_* are forbidden"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[guardasli] production env invalid — deploy aborted"
  exit 1
fi

echo "[guardasli] production env OK"
echo "  deploy: bunx convex deploy"
echo "  then:   bun run sync-env   (pushes the same secrets into the Convex deployment)"
echo "[guardasli] OK is0.0.1"
