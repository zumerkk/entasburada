#!/bin/bash
# Gunluk veri yedegi: data/ + urun gorselleri. 14 gun saklanir.
set -euo pipefail

APP_DIR="/opt/entasburada"
BACKUP_DIR="/var/backups/entasburada"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/entasburada-$STAMP.tar.gz" \
  -C "$APP_DIR" data apps/web/public/uploads .env.production.local

# 14 gunden eski yedekleri sil
find "$BACKUP_DIR" -name "entasburada-*.tar.gz" -mtime +14 -delete

echo "yedek alindi: $BACKUP_DIR/entasburada-$STAMP.tar.gz"
