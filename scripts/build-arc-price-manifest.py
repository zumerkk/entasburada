"""PDF'nin görsel olarak kontrol edilen 4 sayfasını mevcut SKU'larla eşleştirir.
Ham PDF fiyatı katalogda korunur; satış fiyatı commercial-policy ile hesaplanır.
Canlı sisteme yazmaz.
"""
import json, re, unicodedata
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
# Model | ölçüler (son değer boy dolap) | PDF fiyatları. Sayfa ve sıra korunur.
PAGES = [
'''ARMONİ|100,boy|42690,25170
ZETA|100|38070
KAREN antrasit|80,120,boy|33190,39980,14760
KAREN beyaz|80,120,boy|29120,36370,14760
VİCTORİA|100|30910
OKYANUS|65,80,100,boy|13120,15540,19330,9700
DİVA|65,80,100,boy|12940,15300,18790,9280
ALFA|100,boy|43530,21550
ELEKTRA|65,80,100,boy|16050,17760,24900,9700
ELEGANS|65,80,100,boy|12500,17180,21120,9700
KARİNA|65,80,100,boy|16880,19230,22920,9700
SATİNA|65,80,100,boy|13750,16000,19380,9700
MİLANO|65,80,boy|19100,21410,9700
ROMA|65,80,boy|16340,18130,9700''',
'''ELİS|80,boy|22480,9700
ANTİK|65,80,100,boy|14530,16090,19780,9700
LEON|65,80,100,boy|12010,14140,17860,9700
LOTUS|65,80,100,boy|13510,14880,16830,9700
VENÜS|65,80,100,boy|12850,15270,19060,9700
VENÜS Led|65,80,100,boy|16210,18630,23090,9700
DORA|65,80,100,boy|14280,16590,20560,9700
DORA Led|65,80,100,boy|17640,19950,24600,9700
LİNA|65,80,100,boy|14530,15900,17850,9700
HANEDAN|65,80,100,boy|14310,15900,18860,10380
VİYANA|80,boy|34750,23330
KİNG|65,80,100,boy|15540,17080,20560,10380
MERKÜR|65,80,100,boy|14490,16840,20460,10380
NEPTÜN|65,80,100,boy|13590,16060,20650,10380
MELİSA|80,boy|22130,7500
BELLA|65,80,100,boy|15290,17640,21300,10630''',
'''AZUR|65,80,100,boy|13710,16450,20100,7180
DEFNE|65,80,100,boy|12120,14290,17730,7180
REGNUM|65,80,100,boy|15150,17680,21170,7180
SETRA|90|16080
EGE|65,80,100,boy|11770,13990,16950,6640
YAĞMUR|65,80,100,boy|10990,13020,16010,6640
ATLAS|80,boy|14640,6640
BODRUM|55,65,80,100,boy|11540,12470,14810,18250,6640
DENİZ|80,100,boy|10840,11350,6640
ASYA|65,80,boy|11720,13720,6640
CUNDA modern|55,65,80,100,boy|8950,9620,11730,12580,6640
CUNDA klasik|55,65,80,100,boy|8950,9620,11730,12580,6640
GÖCEK modern|55,65,80,100,boy|7800,8450,10080,13570,6290
GÖCEK klasik|55,65,80,100,boy|7800,8450,10080,13570,6290
ARYA|55,65,80,100,boy|6980,7600,9500,12110,6290
KARYA|55,65,80,100,boy|7720,8260,9990,12560,6720''',
'''VERA|55,65,80,100,boy|6530,7120,8800,11010,5610
VERDA|55,65,80,100,boy|7120,7620,9160,11540,6720
LAL|55,65,80,100,boy|6530,7120,8800,11010,5610
LALE|55,65,80,100,boy|7120,7620,9160,11540,6720
İNCİ|55,65,80,boy|5860,6430,7400,5610
HELENA|55,65,80,boy|6530,7120,8800,5610
KUZEY|55,65,80,100,boy|8000,8650,10440,14040,5610
MİDİ modern|45x26,boy|6230,6640
DURU etejer|55x36,boy|7710,6640
MİDİ etejer|45x26,boy|5520,6640
KUMSAL|110,boy|19170,6640
DURU modern|55x36,70x36,boy|8630,10410,6640
Ç.MAKİNA -2-|renkli,beyaz|12920,12230
Ç.MAKİNA -1-|renkli,beyaz|10310,9710'''
]
def norm(s):
    s=s.replace('ı','i').replace('İ','I')
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def money(v):return str(Decimal(v).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
public=json.loads((ROOT/'output/arc-banyo/public-before.json').read_text())['items']
assert len(public)==212
rows=[]
for page,block in enumerate(PAGES,1):
    for line in block.splitlines():
        model,sizes,prices=line.split('|')
        for size,price in zip(sizes.split(','),prices.split(','),strict=True):
            matches=[]
            for p in public:
                sku=p['sku']
                if model.startswith('Ç.'):
                    ok=norm(sku)==norm(model+' '+size)
                else:
                    if ' - ' not in sku: continue
                    m,variant=sku.split(' - ',1)
                    v=norm(variant)
                    parsed='boy' if v.startswith('boydol') else re.sub(r'cm.*','',v)
                    ok=norm(m)==norm(model) and parsed==norm(size)
                if ok:matches.append(p)
            assert len(matches)==1,(model,size,matches)
            p=matches[0]
            gross=Decimal(price)*Decimal('.6875')
            rows.append(dict(sku=p['sku'],slug=p['slug'],model=model,size=size,pdfPage=page,
                previousBrand=p['brand'],previousTaxRate=p['taxRate'],brand='ARC BANYO',taxRate='10',
                listPrice=money(price),dealerGrossPrice=money(gross),imageUrl=p['image']))
assert len(rows)==212 and len({r['sku'] for r in rows})==212
out=ROOT/'scripts/catalog-data/arc-banyo-2025-02.json'
out.write_text(json.dumps(dict(sourceKey='catalog-pdfler-fiyat-listesi-subat-2025',
    sourceFile='FİYAT LİSTESİ ŞUBAT 2025.pdf',formula='listPrice * 0.50 * 1.25 * 1.10',
    storage='listPrice remains the raw supplier PDF price; commercial-policy applies 0.6875 once',
    rows=rows),ensure_ascii=False,indent=2)+'\n')
report=['# ARC Banyo - 18.09.2026 kontrolü','',
'Durum: Yerel düzeltme ve 212 ürün için fiyat eşleştirmesi hazır. Canlıya uygulanmadı.',
'', '42 ürün ARC BANYO, 170 ürün Marka Bekliyor. 212 ürünün tamamında mevcut KDV %20; müşteri talebi %10. Kaynak: catalog-pdfler-fiyat-listesi-subat-2025.',
'', 'Hesap: PDF liste fiyatı × 0,50 × 1,25 × 1,10 = × 0,6875. %25 maliyet üzerine eklemedir. Liste fiyatı alanına ham PDF fiyatı kaydedilir; net satış fiyatı ikinci kez iskonto edilmemelidir.',
'', 'PDF görselleri çoğunlukla 270×270 piksel. Gerçek detay artışı için üreticinin yüksek çözünürlüklü fotoğrafları gerekir. Fotoğraflar değiştirilmedi.',
'', '| PDF sayfa | SKU | PDF liste TL | KDV dahil bayi satış TL |','|---|---|---:|---:|']
report += [f"| {r['pdfPage']} | {r['sku']} | {r['listPrice']} | {r['dealerGrossPrice']} |" for r in rows]
(ROOT/'output/arc-banyo/rapor.md').write_text('\n'.join(report)+'\n')
print('Matched',len(rows),'rows across',len(PAGES),'pages')
