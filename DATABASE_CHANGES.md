# Database Changes

Şu an proje dosya tabanlı kalıcı kayıtlarla çalışıyor. Bu sürümde yeni logical tablolar JSON karşılıklarıyla ayrıldı:

- `BrandSettings` -> `data/brand-settings.json`
- `VideoPopupSettings` -> `data/brand-settings.json.videoPopup`
- `UserEvent` -> `data/user-events.json`
- `SalesOpportunity` -> `data/sales-opportunities.json`
- `SalesTask` -> `data/sales-tasks.json`
- `ImportJob` -> `data/ai-import-jobs.json`
- `ImportExtractedProduct` -> `data/ai-import-jobs.json.extractedProducts`
- `ImportQualityIssue` -> `data/ai-import-jobs.json.qualityIssues`

## Sonraki Teknik Adım

PostgreSQL / Prisma taşıması sonraki büyük adımdır. Sipariş, teklif, event, import job, customer intelligence ve brand settings tabloları Prisma schema ile kalıcı veritabanına alınmalı.
