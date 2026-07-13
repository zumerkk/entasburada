#!/bin/bash
# Lokal makineden VPS'e deploy.
# Kullanim:
#   ./deploy/deploy.sh entas@SUNUCU_IP              # kod + gorseller (veri dosyalarina DOKUNMAZ)
#   ./deploy/deploy.sh entas@SUNUCU_IP --with-data  # ILK deploy: data/ ve .env.production.local dahil
set -euo pipefail

TARGET="${1:?Kullanim: ./deploy/deploy.sh entas@SUNUCU_IP [--with-data]}"
WITH_DATA="${2:-}"
APP_DIR="/opt/entasburada"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== Kod senkronizasyonu =="
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude data --exclude "apps/web/public/uploads" \
  --exclude ".env*" --exclude Pdfler \
  "$ROOT/" "$TARGET:$APP_DIR/"

echo "== Urun gorselleri (sadece ekleme, silme yok) =="
rsync -az "$ROOT/apps/web/public/uploads/" "$TARGET:$APP_DIR/apps/web/public/uploads/"

if [ "$WITH_DATA" = "--with-data" ]; then
  echo "== VERI + ENV ilk yukleme (sunucudaki mevcut veriyi ezer!) =="
  rsync -az "$ROOT/data/" "$TARGET:$APP_DIR/data/"
  rsync -az "$ROOT/.env.production.local" "$TARGET:$APP_DIR/.env.production.local"
fi

echo "== Sunucuda kurulum + build + yeniden baslatma =="
ssh "$TARGET" "set -e; cd $APP_DIR && pnpm install --frozen-lockfile && pnpm --filter @entas/web build && sudo systemctl restart entasburada && sleep 3 && curl -sf -o /dev/null http://127.0.0.1:3000/ && echo 'DEPLOY BASARILI: uygulama yanit veriyor'"
