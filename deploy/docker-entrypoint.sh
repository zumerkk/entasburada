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

for CATALOG_RELEASE_DIR in /app/deploy/catalog-releases/*; do
  [ -d "$CATALOG_RELEASE_DIR" ] || continue
  CATALOG_RELEASE_VERSION="$(basename "$CATALOG_RELEASE_DIR")"
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
done

for SUPPLIER_STATUS_RELEASE in /app/deploy/supplier-status-releases/*.json; do
  [ -f "$SUPPLIER_STATUS_RELEASE" ] || continue
  SUPPLIER_STATUS_VERSION="$(basename "$SUPPLIER_STATUS_RELEASE" .json)"
  SUPPLIER_STATUS_MARKER="$DATA_DIR/.supplier-status-$SUPPLIER_STATUS_VERSION"
  if [ ! -f "$SUPPLIER_STATUS_MARKER" ]; then
    echo "[entrypoint] tedarikci durumu uygulanıyor: $SUPPLIER_STATUS_VERSION"
    cd /app
    pnpm supplier:status -- \
      --migration="$SUPPLIER_STATUS_RELEASE" \
      --catalog-store="$DATA_DIR/data/catalog-store.json" \
      --audit-log="$DATA_DIR/data/audit-log.json" \
      --actor="render-release-$SUPPLIER_STATUS_VERSION" \
      --write
    date -u +%Y-%m-%dT%H:%M:%SZ > "$SUPPLIER_STATUS_MARKER"
  fi
done

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

# ARC fiyat politikasıyla veri onarımını sunucu başlamadan birlikte uygula.
ARC_REPAIR_MARKER="$DATA_DIR/.arc-banyo-pricing-2026-09-18-v1"
if [ -f "$DATA_DIR/data/catalog-store.json" ] && [ ! -f "$ARC_REPAIR_MARKER" ]; then
  if node -e 'const s=require(process.argv[1]); process.exit(s.products.some(p=>p.sourceKey==="catalog-pdfler-fiyat-listesi-subat-2025")?0:1)' "$DATA_DIR/data/catalog-store.json"; then
    node /app/scripts/repair-arc-banyo.mjs "$DATA_DIR/data/catalog-store.json" --apply
    date -u +%Y-%m-%dT%H:%M:%SZ > "$ARC_REPAIR_MARKER"
  fi
fi

# Yalnızca müşteri getiren Yetkili Panel hesabını (Eren) bir kez Pazarlamacı moduna al; %20 satıcı farkı kalkar.
# Hata veya eşleşme yoksa açılış durmaz, işaret yazılmaz ve sonraki açılışta yeniden denenir.
REFERRAL_SELLER_MARKER="$DATA_DIR/.referral-sellers-2026-09-19-v1"
if [ -f "$DATA_DIR/data/customer-accounts.json" ] && [ ! -f "$REFERRAL_SELLER_MARKER" ]; then
  if node /app/scripts/set-referral-sellers.mjs "$DATA_DIR/data/customer-accounts.json" --apply; then
    date -u +%Y-%m-%dT%H:%M:%SZ > "$REFERRAL_SELLER_MARKER"
  else
    echo "[entrypoint] Pazarlamacı hesap güncellemesi uygulanmadı; sunucu açılışı sürüyor"
  fi
fi

chown -R nextjs:nodejs "$DATA_DIR/data" "$DATA_DIR/uploads"

cd /app/apps/web
exec gosu nextjs ./node_modules/.bin/next start --port "${PORT:-3000}"
