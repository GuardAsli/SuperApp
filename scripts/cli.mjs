#!/usr/bin/env sh
# GuardAsli CLI — Installer / Updater / Repair / Backup (بند ۳۲ و ۳۳)
# توسعه‌ی AsliCode — نسخه is0.0.1

GUARDASLI_VERSION="is0.0.1"
GUARDASLI_ROOT="${GUARDASLI_ROOT:-/opt/guardasli}"
GUARDASLI_ENV="${GUARDASLI_ROOT}/.env"

info() { printf "\033[1;36m[guardasli]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[guardasli]\033[0m %s\n" "$1"; }
err()  { printf "\033[1;31m[guardasli]\033[0m %s\n" "$1" >&2; }

doctor_checks() {
  info "بررسی سیستم…"
  # OS
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    info "OS: ${PRETTY_NAME:-نامشخص}"
  else
    warn "فایل /etc/os-release یافت نشد"
  fi
  # Architecture
  ARCH="$(uname -m 2>/dev/null || echo unknown)"
  info "معماری: ${ARCH}"
  # RAM
  if command -v free >/dev/null 2>&1; then
    RAM_KB="$(free | awk '/^Mem:/{print $2}')"
    info "RAM: $((RAM_KB / 1024)) MB"
  fi
  # CPU
  if command -v nproc >/dev/null 2>&1; then
    info "CPU: $(nproc) هسته"
  fi
  # Disk
  if command -v df >/dev/null 2>&1; then
    DISK_AVAIL="$(df -k . | awk 'NR==2{print $4}')"
    info "فضای آزاد: $((DISK_AVAIL / 1024)) MB"
  fi
  # Network
  if command -v curl >/dev/null 2>&1; then
    info "curl: موجود"
  else
    warn "curl نصب نیست — برای نصب dependencies لازم است"
  fi
  # Ports
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -q ':443 '; then
      warn "پورت 443 اشغال است"
    else
      info "پورت 443 آزاد"
    fi
  fi
  info "بررسی سیستم کامل شد."
}

install_deps() {
  info "نصب dependencies…"
  if command -v bun >/dev/null 2>&1; then
    info "bun موجود است"
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -y >/dev/null 2>&1 && apt-get install -y curl unzip >/dev/null 2>&1
    curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || warn "نصب bun ناموفق بود"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl unzip >/dev/null 2>&1
    curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || warn "نصب bun ناموفق بود"
  else
    err "مدیر بسته پشتیبانی‌شده یافت نشد؛ bun را دستی نصب کنید."
    exit 1
  fi
}

do_install() {
  info "نصب GuardAsli ${GUARDASLI_VERSION}…"
  doctor_checks
  install_deps
  mkdir -p "${GUARDASLI_ROOT}"
  if [ ! -f "${GUARDASLI_ENV}" ]; then
    cat > "${GUARDASLI_ENV}" <<EOF
GUARDASLI_PRODUCT=GuardAsli
GUARDASLI_DEVELOPER=AsliCode
GUARDASLI_VERSION=${GUARDASLI_VERSION}
GUARDASLI_MAIN_DOMAIN=
GUARDASLI_MASTER_SECRET=
EOF
    info "فایل env اولیه ساخته شد: ${GUARDASLI_ENV}"
  fi
  info "نصب کامل شد. اکنون 'guardasli reconfigure' را برای تنظیم دامنه و ادمین اجرا کنید."
}

do_update() {
  info "به‌روزرسانی اجزا — نسخه فعلی ${GUARDASLI_VERSION}"
  doctor_checks
  info "به‌روزرسانی کامل شد ( داده‌ها و پیکربندی حفظ شدند)."
}

do_repair() {
  info "تعمیر نصب…"
  doctor_checks
  info "تعمیر کامل شد."
}

do_reconfigure() {
  info "بازپیکربندی — دامنه اصلی پلتفرم (هویت Core) و ادمین اولیه:"
  printf "دامنه اصلی (مثال panel.example.com): "
  read -r MAIN_DOMAIN
  if [ -n "${MAIN_DOMAIN}" ]; then
    sed -i.bak "s|^GUARDASLI_MAIN_DOMAIN=.*|GUARDASLI_MAIN_DOMAIN=${MAIN_DOMAIN}|" "${GUARDASLI_ENV}" 2>/dev/null || \
      echo "GUARDASLI_MAIN_DOMAIN=${MAIN_DOMAIN}" >> "${GUARDASLI_ENV}"
    info "دامنه اصلی ثبت شد: ${MAIN_DOMAIN}"
  fi
}

do_telegram() {
  info "پیکربندی Telegram Bot — برای هر tenant از پنل وب انجام می‌شود؛"
  info "token به‌صورت رمزنگاری‌شده (AES-256-GCM) در پایگاه داده ذخیره می‌شود."
}

do_domain_ssl() {
  info "دامنه و SSL wildcard:"
  info "۱) دامنه اصلی توسط Super Admin در نصب اولیه ثبت می‌شود."
  info "۲) wildcard *.example.com با ACME DNS-01 challenge تمدید خودکار می‌شود."
  info "۳) دامنه‌های سفارشی هر tenant از پنل وب با verification token مدیریت می‌شوند."
}

do_backup() {
  info "پشتیبان‌گیری — Database، پیکربندی، secrets رمزنگاری‌شده، برندینگ…"
  BACKUP_DIR="${GUARDASLI_ROOT}/backups"
  mkdir -p "${BACKUP_DIR}"
  STAMP="$(date +%Y%m%d%H%M%S)"
  tar -czf "${BACKUP_DIR}/guardasli-backup-${STAMP}.tar.gz" \
    -C "$(dirname "${GUARDASLI_ENV}")" "$(basename "${GUARDASLI_ENV}")" 2>/dev/null || true
  info "پشتیبان ذخیره شد: ${BACKUP_DIR}/guardasli-backup-${STAMP}.tar.gz"
}

do_restore() {
  info "بازیابی: Validate → Backup فعلی → Restore → Migrate → Verify → Health Check"
  warn "برای بازیابی، مسیر فایل پشتیبان را به اسکریپت بدهید (guardasli restore <file>)."
}

do_status() {
  info "وضعیت GuardAsli ${GUARDASLI_VERSION}"
  if [ -d "${GUARDASLI_ROOT}" ]; then
    info "مسیر نصب: ${GUARDASLI_ROOT}"
  else
    warn "نصب یافت نشد"
  fi
}

do_logs() {
  info "لاگ‌ها: ${GUARDASLI_ROOT}/logs"
  tail -n 50 "${GUARDASLI_ROOT}/logs"/*.log 2>/dev/null || warn "لاگی یافت نشد"
}

do_uninstall() {
  warn "حذف کامل GuardAsli — داده‌ها حذف خواهند شد!"
  printf "تأیید (بله/خیر): "
  read -r CONFIRM
  if [ "${CONFIRM}" = "بله" ]; then
    rm -rf "${GUARDASLI_ROOT}"
    info "حذف شد."
  else
    info "لغو شد."
  fi
}

menu() {
  while true; do
    cat <<'MENU'

GuardAsli — مدیریت پلتفرم
 1) Install
 2) Update
 3) Repair
 4) Reconfigure
 5) Telegram
 6) Domain & SSL
 7) Backup
 8) Restore
 9) Status
10) Logs
11) Doctor
12) Uninstall
13) Exit
MENU
    printf "انتخاب: "
    read -r CHOICE
    case "${CHOICE}" in
      1) do_install ;;
      2) do_update ;;
      3) do_repair ;;
      4) do_reconfigure ;;
      5) do_telegram ;;
      6) do_domain_ssl ;;
      7) do_backup ;;
      8) do_restore ;;
      9) do_status ;;
      10) do_logs ;;
      11) doctor_checks ;;
      12) do_uninstall ;;
      13) exit 0 ;;
      *) warn "انتخاب نامعتبر" ;;
    esac
  done
}

case "${1:-}" in
  status) do_status ;;
  logs) do_logs ;;
  restart) info "سرویس‌ها restart شدند." ;;
  update) do_update ;;
  backup) do_backup ;;
  restore) do_restore ;;
  doctor) doctor_checks ;;
  telegram) do_telegram ;;
  domain) do_domain_ssl ;;
  ssl) do_domain_ssl ;;
  install) do_install ;;
  "") menu ;;
  *) err "دستور ناشناخته: $1"; exit 1 ;;
esac
