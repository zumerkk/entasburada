#!/bin/sh
# Kalici disk baglantisi: data/ ve uploads/ konteyner disina (DATA_DIR) tasinir.
set -eu

DATA_DIR="${DATA_DIR:-/var/data}"
mkdir -p "$DATA_DIR/data" "$DATA_DIR/uploads"

# ilk acilis: imaja gomulu seed'i (data/import-results) bos diske kopyala
if [ -d /app/data-seed ] && [ ! -e "$DATA_DIR/data/import-results" ]; then
  cp -R /app/data-seed/. "$DATA_DIR/data/"
  echo "[entrypoint] seed verisi diske kopyalandi"
fi

rm -rf /app/data
ln -sfn "$DATA_DIR/data" /app/data
rm -rf /app/apps/web/public/uploads
ln -sfn "$DATA_DIR/uploads" /app/apps/web/public/uploads

IMAGE_NORMALIZATION_VERSION="${PRODUCT_IMAGE_NORMALIZATION_VERSION:-square-v1}"
IMAGE_NORMALIZATION_MARKER="$DATA_DIR/.product-images-$IMAGE_NORMALIZATION_VERSION"
FIRST_PRODUCT_IMAGE="$(find "$DATA_DIR/uploads/catalog-imports" -type f -path '*/products/*' -name '*.webp' -print -quit 2>/dev/null || true)"
if [ -n "$FIRST_PRODUCT_IMAGE" ] && [ ! -f "$IMAGE_NORMALIZATION_MARKER" ]; then
  echo "[entrypoint] urun gorselleri 1200x1200 standardina getiriliyor"
  cd /app
  pnpm images:normalize -- --write \
    --root "$DATA_DIR/uploads/catalog-imports" \
    --catalog-store "$DATA_DIR/data/catalog-store.json" \
    --concurrency 6 \
    --backup-dir "$DATA_DIR/image-backups/$IMAGE_NORMALIZATION_VERSION" \
    --report "$DATA_DIR/data/image-normalization-report.json"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$IMAGE_NORMALIZATION_MARKER"
fi

if [ -f /app/data/catalog-store.json ]; then
  echo "[entrypoint] katalog siniflandirmasi denetleniyor"
  cd /app
  pnpm catalog:reclassify -- --write
fi

cd /app/apps/web
exec ./node_modules/.bin/next start --port "${PORT:-3000}"
