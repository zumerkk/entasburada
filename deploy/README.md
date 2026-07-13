# ENTASBURADA — VPS Canlıya Alma Rehberi (Aşama 1)

Mimari: tek VPS üzerinde `next start` (port 3000) + nginx reverse proxy + Let's Encrypt SSL.
Veri `data/*.json` ve ürün görselleri `apps/web/public/uploads/` sunucu diskinde yaşar; her gece 03:20'de otomatik yedeklenir.

## Gerekenler

- Ubuntu 22.04 veya 24.04 VPS — önerilen: 4 GB RAM / 2 vCPU / 40+ GB disk
  (Hetzner CX22 ~€4/ay, DigitalOcean 4GB ~$24/ay, ya da yerli sağlayıcı)
- Domain DNS yönetimi (A kaydı ekleyebilmek)
- Lokalde: bu repo + `.env.production.local` (hazır) + `rsync`/`ssh`

## Adımlar

### 1. VPS satın al, SSH anahtarınla gir

```bash
ssh root@SUNUCU_IP
```

### 2. DNS A kayıtlarını ekle (domain panelinden)

| Tip | Ad  | Değer      |
|-----|-----|------------|
| A   | @   | SUNUCU_IP  |
| A   | www | SUNUCU_IP  |

### 3. Kurulum scriptini sunucuya kopyala ve çalıştır (sunucuda, root)

```bash
# lokal makineden:
scp -r deploy root@SUNUCU_IP:/root/deploy
# sunucuda:
sudo bash /root/deploy/setup-vps.sh entasburada.com
```

Script; Node 22, pnpm, nginx, certbot, poppler, pdfplumber kurar; `entas` kullanıcısını,
systemd servisini, nginx yapılandırmasını, güvenlik duvarını ve günlük yedeği hazırlar.

### 4. entas kullanıcısına SSH anahtarı tanımla (sunucuda, root)

```bash
mkdir -p /home/entas/.ssh && cp /root/.ssh/authorized_keys /home/entas/.ssh/
chown -R entas:entas /home/entas/.ssh && chmod 700 /home/entas/.ssh
```

### 5. İlk deploy (lokal makineden — veri ve env dahil)

```bash
./deploy/deploy.sh entas@SUNUCU_IP --with-data
```

### 6. SSL sertifikası (sunucuda, DNS yayıldıktan sonra)

```bash
sudo certbot --nginx -d entasburada.com -d www.entasburada.com
```

### 7. Kontrol

- https://entasburada.com açılıyor mu, ürün görselleri geliyor mu?
- https://entasburada.com/admin — `.env.production.local` içindeki ADMIN_EMAIL / ADMIN_PASSWORD ile giriş
- Test bayi hesabıyla giriş + sepete ekleme + teklif oluşturma
- `sudo systemctl status entasburada` ve `journalctl -u entasburada -f` ile loglar

## Sonraki deploylar (kod güncellemesi)

```bash
./deploy/deploy.sh entas@SUNUCU_IP        # --with-data YOK: sunucudaki siparis/musteri verisi korunur
```

## Yedekten dönme

```bash
# sunucuda:
sudo systemctl stop entasburada
sudo tar -xzf /var/backups/entasburada/entasburada-YYYYMMDD-HHMMSS.tar.gz -C /opt/entasburada
sudo systemctl start entasburada
```

## Notlar / bilinçli sınırlar (Aşama 2'de çözülecek)

- Tek sunucu mimarisi: yatay ölçekleme yok; veri JSON dosyalarında (PostgreSQL geçişi Aşama 2).
- E-posta bildirimi yok; siparişler yalnızca admin panelde görünür — panel bildirimlerini düzenli kontrol edin.
- XML fiyat güncellemesi manuel: admin paneldeki içe aktarma ekranından tetiklenir.
- Canlıya gerçek bayiler alınmadan önce `data/customer-accounts.json` içindeki 3 test hesabını silin
  ya da `status` alanlarını `suspended` yapın.
