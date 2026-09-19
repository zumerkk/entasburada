import type { CatalogProductRecord } from "@entas/catalog";
import type { AdminOrder } from "./commercial-repository";
import type { EnexOrder, EnexProduct } from "./enexai-types";
import { orderStatusLabel } from "./commercial-labels";

export function normalizeEnexText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const STOP_WORDS = new Set("bir bana beni benim icin ile ve veya ama de da mi mu bu su o var yok olan olarak lutfen ariyorum arar misin istiyorum istiyordum lazim gerek gerekiyor almak alabilirim alabilirsin oner onerin oneri onerir onerileri goster gosterir bul bulur urun urunler urunleri urunlerden urunun urunu katalog katalogda fiyat fiyatli fiyati fiyatlarini uygun ekonomik ucuz pahali alternatif alternatifleri alternatiflerini muadil muadilleri stok stokta stoklu sepete sepet sepetim sepetimi sepetimde birlikte tamamlayici yanina baska neler nasil hangisi hangileri karsilastir karsilastirmak karsilastirma daha en son onceki tekrar siparis siparisler siparislerim siparislerimi kontrol et edelim istiyorum ihtiyacim ihtiyac ihtiyacina merhaba selam yardim yardimci olabilirsin ne yapabilirsin ac acabilir bilgi alabilir iyisi listele guncel kalem stoklarina bak ogren ogrenmek hakkinda lutfen alalim ekle eklemek istedim almak istedigim urunum bunlar bunlari bunlarin bunu bunun sunu sunlari hem nasil cok kac fiyata fiyatlar fiyatlari turkiyede tane adet marka markali malzeme malzemeleri istedigimi".split(" "));
const SUFFIXES = ["larindan", "lerinden", "larinin", "lerinin", "larini", "lerini", "larina", "lerine", "larimi", "lerimi", "larim", "lerim", "lari", "leri", "sini", "sina", "sinin", "inin", "unun", "lerin", "larin", "lar", "ler"];
for (const token of ["hangi", "inceleyebilirim", "incelemek", "markasinin", "markanin", "tadilati", "tadilat", "satin", "bulabilirim", "bulabilirsin"]) STOP_WORDS.add(token);

export function enexSearchTerms(query: string): string[] {
  return [...new Set(normalizeEnexText(query).split(/[^a-z0-9/.,-]+/).map((token) => {
    if (STOP_WORDS.has(token)) return "";
    for (const suffix of SUFFIXES) {
      if (token.endsWith(suffix) && token.length - suffix.length >= 4) return token.slice(0, -suffix.length);
    }
    return token;
  }).filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))].slice(0, 14);
}

export type EnexIntent = "search" | "alternatives" | "complements" | "compare" | "orders" | "cart" | "shipping" | "help";
export function enexIntent(query: string): EnexIntent {
  const text = normalizeEnexText(query);
  if (/onceki siparis|son siparis|siparisler|siparisim|kargom|siparis gecmis|gecmis siparis|siparis.*tekrar|tekrar.*siparis/.test(text)) return "orders";
  if (/karsilastir|kiyas|farki|farklari/.test(text)) return "compare";
  if (/alternatif|muadil|yerine|stokta yok|stok yok|tuken/.test(text)) return "alternatives";
  if (/birlikte|tamamlayici|yanina|eksik|baska ne/.test(text)) return "complements";
  if (/kargo|teslimat|sevkiyat/.test(text)) return "shipping";
  if (/sepet/.test(text)) return "cart";
  if (/yardim|neler yap|ne yapabilir|nasil|bayi|hesap|sifre|teklif|proje|favori|belge|dokuman|teknik ozellik|iade|garanti|iletisim|odeme|taksit|malzeme listesi/.test(text)) return "help";
  return "search";
}

export function isEnexAvailable(product: Pick<CatalogProductRecord, "stockStatus">): boolean {
  return product.stockStatus === "in_stock" || product.stockStatus === "low_stock";
}

export function visibleEnexCatalog(products: CatalogProductRecord[]): CatalogProductRecord[] {
  return products.filter((product) => product.status === "ACTIVE" && product.isVisible);
}

/** Explicit references survive conversational boilerplate and multi-product comparisons. */
export function mentionedEnexProducts(products: CatalogProductRecord[], query: string): CatalogProductRecord[] {
  const text = normalizeEnexText(query);
  const matches = visibleEnexCatalog(products).map((product) => {
    const code = normalizeEnexText(product.sku).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const codeMentioned = code.length >= 2 && new RegExp(`(?:^|[^a-z0-9])${code}(?=$|[^a-z0-9])`).test(text);
    const nameMentioned = text.includes(normalizeEnexText(product.name));
    return { product, score: (codeMentioned ? 2 : 0) + (nameMentioned ? 1 : 0) };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  return matches.filter((entry) => !matches.some((other) => other.product.sku === entry.product.sku && other.score > entry.score)).slice(0, 8).map((entry) => entry.product);
}

/** Ranking runs locally. No raw supplier prices, customer credentials or stock counts leave the server. */
export function searchEnexCatalog(products: CatalogProductRecord[], query: string, options: { availableOnly?: boolean; limit?: number; excludeSlugs?: string[] } = {}): CatalogProductRecord[] {
  const terms = enexSearchTerms(query);
  const excluded = new Set(options.excludeSlugs ?? []);
  const candidates = visibleEnexCatalog(products).filter((product) => !excluded.has(product.slug) && (!options.availableOnly || isEnexAvailable(product)));
  if (!terms.length) return [];
  const phrase = terms.join(" ");
  const recognizedTerms = new Set<string>();
  const ranked = candidates.map((product) => {
    const name = normalizeEnexText(product.name);
    const code = normalizeEnexText(`${product.sku} ${product.manufacturerCode ?? ""} ${product.barcode ?? ""}`);
    const brand = normalizeEnexText(product.brand);
    const category = normalizeEnexText(product.categoryPath.join(" ") + " " + product.category);
    const specs = normalizeEnexText((product.technicalSpecs ?? []).map((spec) => `${spec.label} ${spec.value}`).join(" "));
    let matched = 0;
    let score = 0;
    for (const term of terms) {
      const termScore = code.split(" ").includes(term) ? 30 : name.includes(term) ? 12 : brand.includes(term) ? 10 : specs.includes(term) ? 5 : category.includes(term) ? 3 : 0;
      if (termScore) { matched++; recognizedTerms.add(term); }
      score += termScore;
    }
    if (!matched) return { product, score: 0 };
    if (name.includes(phrase)) score += 20;
    if (isEnexAvailable(product)) score += 2;
    return { product, score: score + matched * 4, matched };
  });
  // Ignore conversational words unknown to the catalog while retaining real brand/size constraints.
  return ranked.filter((entry) => entry.score > 0 && (entry.matched ?? 0) >= Math.ceil(recognizedTerms.size * 0.6)).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "tr"))
    .slice(0, Math.min(16, Math.max(1, options.limit ?? 6))).map((entry) => entry.product);
}

export function featuredEnexCatalog(products: CatalogProductRecord[], limit = 4): CatalogProductRecord[] {
  const visible = visibleEnexCatalog(products).filter(isEnexAvailable);
  const chosen: CatalogProductRecord[] = [];
  const groups = new Set<string>();
  for (const product of visible) {
    const group = product.catalogClassification?.groupSlug || product.category;
    if (groups.has(group)) continue;
    groups.add(group);
    chosen.push(product);
    if (chosen.length === limit) break;
  }
  return chosen;
}

export function alternativeEnexCatalog(products: CatalogProductRecord[], anchor: CatalogProductRecord, limit = 5): CatalogProductRecord[] {
  const base = visibleEnexCatalog(products).filter((product) => product.slug !== anchor.slug && isEnexAvailable(product) && product.category === anchor.category);
  const ranked = searchEnexCatalog(base, anchor.name, { availableOnly: true, limit });
  return ranked.length ? ranked : base.slice(0, limit);
}

export function complementaryEnexCatalog(products: CatalogProductRecord[], anchors: CatalogProductRecord[], limit = 5): CatalogProductRecord[] {
  const context = normalizeEnexText(anchors.map((product) => `${product.name} ${product.category}`).join(" "));
  const rules: Array<[RegExp, string[]]> = [
    [/boru|tesisat|vana|musluk|batarya|flex|rakor/, ["teflon", "conta", "vana", "flex"]],
    [/matkap|vidalama|vida|dubel/, ["matkap ucu", "bits", "dubel", "vida"]],
    [/hortum|sulama|bahce/, ["kelepce", "hortum baglanti", "vana"]],
    [/boya|astar|firca/, ["rulo", "maskeleme", "firca"]],
    [/pompa|hidrofor/, ["cekvalf", "vana", "rakor"]],
    [/dus|lavabo|banyo/, ["sifon", "flex", "silikon"]]
  ];
  const excluded = new Set(anchors.map((product) => product.slug));
  const result: CatalogProductRecord[] = [];
  for (const [pattern, queries] of rules) {
    if (!pattern.test(context)) continue;
    for (const query of queries) {
      for (const product of searchEnexCatalog(products, query, { availableOnly: true, limit: 2, excludeSlugs: [...excluded] })) {
        result.push(product);
        excluded.add(product.slug);
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
}

/** Exact ownership is rechecked after the repository's fuzzy search. Never accept an email or order id from the client. */
export function ownEnexOrders(orders: AdminOrder[], customerEmail: string, products: CatalogProductRecord[]): EnexOrder[] {
  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  if (!normalizeEmail(customerEmail)) return [];
  const bySku = new Map<string, CatalogProductRecord[]>();
  for (const product of visibleEnexCatalog(products)) {
    const key = normalizeEnexText(product.sku);
    bySku.set(key, [...(bySku.get(key) ?? []), product]);
  }
  return orders.filter((order) => normalizeEmail(order.email) === normalizeEmail(customerEmail))
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)).slice(0, 4).map((order) => ({
      id: order.id,
      number: order.orderNo,
      date: order.orderedAt,
      status: orderStatusLabel(order.status).label,
      items: order.items.slice(0, 50).map((item) => {
        const matches = bySku.get(normalizeEnexText(item.sku)) ?? [];
        const namedMatches = matches.filter((product) => normalizeEnexText(product.name) === normalizeEnexText(item.productName));
        const product = matches.length === 1 ? matches[0] : namedMatches.length === 1 ? namedMatches[0] : undefined;
        return { productSlug: product?.slug ?? "", sku: item.sku, productName: item.productName, unit: product?.unitType || item.unit, quantity: item.quantity, minOrder: product?.minOrder ?? 1, available: Boolean(product && isEnexAvailable(product)) };
      })
    }));
}

export function safeEnexProduct(product: EnexProduct, authenticated: boolean): EnexProduct {
  const { price, ...publicFields } = product;
  return authenticated && price ? { ...publicFields, price } : publicFields;
}

export function safeEnexPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value.split(/[?#]/)[0]!.slice(0, 300);
}
