#!/usr/bin/env bash
# GuardAsli — apply the Nginx config
# Product: GuardAsli · Developer: AsliCode · Coded by AsliCode
#
# این اسکریپت فقط یک پوسته است؛ منطق واقعی در scripts/nginx-render.sh است تا
# پورت‌های نقش (نماینده/سوپر ادمین) با هر بار اجرا حفظ شوند.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-${GUARDASLI_DOMAIN:-}}"

if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain>"
  exit 1
fi

GA_DOMAIN="${DOMAIN}" \
GA_PORT_UI="${PORT:-4173}" \
GA_PORT_RESELLER="${GUARDASLI_PORT_RESELLER:-105}" \
GA_PORT_SUPER="${GUARDASLI_PORT_SUPER:-616}" \
GA_TLS="${GA_TLS:-auto}" \
bash "${ROOT}/scripts/nginx-render.sh"
