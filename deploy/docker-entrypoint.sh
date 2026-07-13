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

cd /app/apps/web
exec ./node_modules/.bin/next start --port "${PORT:-3000}"
