#!/bin/bash
# ENTASBURADA VPS ilk kurulum scripti (Ubuntu 22.04/24.04, root olarak calistirin)
# Kullanim: sudo bash setup-vps.sh entasburada.com
set -euo pipefail

DOMAIN="${1:-entasburada.com}"
APP_DIR="/opt/entasburada"
APP_USER="entas"

echo "== Sistem paketleri =="
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw rsync \
  poppler-utils python3 python3-pip python3-venv

# pdfplumber (admin panelden PDF import icin)
pip3 install --break-system-packages pdfplumber >/dev/null 2>&1 || pip3 install pdfplumber

echo "== Node.js 22 + pnpm =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@latest --activate

echo "== Uygulama kullanicisi ve dizin =="
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "== systemd servisi =="
cp "$(dirname "$0")/entasburada.service" /etc/systemd/system/entasburada.service
systemctl daemon-reload
systemctl enable entasburada

# deploy scriptinin servis yeniden baslatabilmesi icin sinirli sudo yetkisi
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart entasburada, /usr/bin/systemctl status entasburada" > /etc/sudoers.d/entasburada-restart
chmod 440 /etc/sudoers.d/entasburada-restart

echo "== nginx =="
sed "s/__DOMAIN__/$DOMAIN/g" "$(dirname "$0")/nginx-entasburada.conf" > "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "== Guvenlik duvari =="
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

echo "== Gunluk yedek =="
cp "$(dirname "$0")/backup.sh" /usr/local/bin/entasburada-backup.sh
chmod +x /usr/local/bin/entasburada-backup.sh
echo "20 3 * * * root /usr/local/bin/entasburada-backup.sh" > /etc/cron.d/entasburada-backup

echo ""
echo "KURULUM TAMAM. Simdi sirasiyla:"
echo "1) Lokal makineden ilk deploy:  ./deploy/deploy.sh $APP_USER@<sunucu-ip> --with-data"
echo "2) SSL sertifikasi:             sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "3) Servis kontrol:              sudo systemctl status entasburada"
