#!/usr/bin/env bash
# GuardAsli — apply the optimized Nginx template
# Product: GuardAsli · Developer: AsliCode · Powered By AsliCode
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-${GUARDASLI_DOMAIN:-}}"
PORT_UI="${PORT:-4173}"

if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain>"
  exit 1
fi

TPL="$ROOT/deploy/nginx/guardasli.conf.template"
OUT_AVAILABLE="/etc/nginx/sites-available/guardasli"
MAP_SRC="$ROOT/deploy/nginx/guardasli-map.conf"
MAP_DST="/etc/nginx/conf.d/guardasli-map.conf"

if [ ! -f "$TPL" ]; then
  echo "template missing"
  exit 1
fi

sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__PORT_UI__/${PORT_UI}/g" "$TPL" > /tmp/guardasli.nginx

if [ -d /etc/nginx/sites-available ]; then
  cp /tmp/guardasli.nginx "$OUT_AVAILABLE"
  ln -sf "$OUT_AVAILABLE" /etc/nginx/sites-enabled/guardasli
else
  cp /tmp/guardasli.nginx /etc/nginx/conf.d/guardasli.conf
fi

cp "$MAP_SRC" "$MAP_DST" 2>/dev/null || true

nginx -t
systemctl reload nginx || systemctl restart nginx
echo "[OK] nginx applied for $DOMAIN → 127.0.0.1:$PORT_UI"
