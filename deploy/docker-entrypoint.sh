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

CATALOG_RELEASE_VERSION="2026-07-17-kaplin-kangal-v1"
CATALOG_RELEASE_DIR="/app/deploy/catalog-releases/$CATALOG_RELEASE_VERSION"
CATALOG_RELEASE_MARKER="$DATA_DIR/.catalog-release-$CATALOG_RELEASE_VERSION"
if [ -f "$CATALOG_RELEASE_DIR/products.json" ] && [ ! -f "$CATALOG_RELEASE_MARKER" ]; then
  echo "[entrypoint] katalog surumu uygulanıyor: $CATALOG_RELEASE_VERSION"
  cd /app
  pnpm catalog:release:apply -- \
    --release="$CATALOG_RELEASE_DIR" \
    --catalog-store="$DATA_DIR/data/catalog-store.json" \
    --uploads="$DATA_DIR/uploads" \
    --actor="render-release-$CATALOG_RELEASE_VERSION"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$CATALOG_RELEASE_MARKER"
fi

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
