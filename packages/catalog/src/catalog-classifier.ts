import { CATALOG_TREE } from "./catalog-tree";

export const CATALOG_CLASSIFICATION_VERSION = 2;

export type CatalogClassificationMethod = "pinned-source" | "name-rule" | "source-category" | "source-default" | "fallback";

export interface CatalogClassification {
  version: number;
  method: CatalogClassificationMethod;
  confidence: number;
  ruleId: string;
  groupSlug: string;
  groupLabel: string;
  categorySlug: string;
  categoryLabel: string;
}

export interface ClassifiableCatalogProduct {
  sourceKey: string;
  externalId?: string;
  name?: string;
  productName?: string;
  category?: string;
  categoryName?: string;
  categoryPath?: string[];
  description?: string;
  sku?: string;
  catalogClassification?: CatalogClassification;
}

interface GroupRule {
  groupSlug: string;
  phrases: string[];
}

interface SourceRule {
  source: string | RegExp;
  groupSlug: string;
  categorySlug?: string;
}

const GENERIC_SOURCE_CATEGORIES = new Set(
  [
    "El aletleri ve iş güvenliği",
    "Teknik hırdavat ve el aletleri",
    "Banyo ve mutfak",
    "Sulama sistemleri ve bağlantı elemanları",
    "El aletleri",
    "PDF Katalog",
    "Kategori Bekliyor",
    "Genel",
    "Diger",
    "Diğer",
    "Aksesuarlar",
    "Yedek Parçalar"
  ].map(normalizeCatalogText)
);

// Bu katalogların kapsamı dosya bazında kesin. PDF'ye verilen eski geniş kategori
// ipuçları yerine gerçek katalog alanını kullanırız.
const PINNED_SOURCE_RULES: SourceRule[] = [
  { source: /entas-bk/, groupSlug: "sulama-bahce", categorySlug: "bahce-el-aletleri" },
  { source: /forzaitalia/, groupSlug: "pompa-hidrofor" },
  { source: "catalog-pdfler-fiyat-listesi-subat-2025", groupSlug: "banyo-vitrifiye", categorySlug: "banyo-mobilya" },
  { source: "catalog-pdfler-2025-onay-fiyat-listesi-2026", groupSlug: "boya-kimyasal", categorySlug: "boyalar" },
  { source: /lamindoor/, groupSlug: "kapi-zemin", categorySlug: "ic-kapi" },
  { source: /floorpan/, groupSlug: "kapi-zemin", categorySlug: "laminat-parke" },
  { source: /entas-ym-fiyat-bayi/, groupSlug: "su-depolari", categorySlug: "su-deposu" },
  { source: "catalog-pdfler-2118b277-6634-4c6a-86bf-1bd25d928c42-260401-154138", groupSlug: "su-tesisati", categorySlug: "pvc-fittings" }
];

const SOURCE_DEFAULT_RULES: SourceRule[] = [
  { source: /sgs-fiyat-listesi/, groupSlug: "hirdavat-baglanti" },
  { source: /tricraft/, groupSlug: "hirdavat-baglanti" },
  { source: /entas-sulama/, groupSlug: "sulama-bahce" },
  { source: "euromix-stock", groupSlug: "su-tesisati" },
  { source: "mirsan-efiyat", groupSlug: "hirdavat-baglanti" }
];

// Sıra bilinçlidir: daha özgül alanlar, ortak kelime taşıyan daha genel alanlardan
// önce çözülür. Eşleşme exact token/phrase ve kontrollü Türkçe çekim köklerine
// göre yapılır; "dus" artık "endustriyel" veya "dusurucu" içinde eşleşmez.
const HIGH_PRIORITY_NAME_RULES: GroupRule[] = [
  {
    groupSlug: "boya-kimyasal",
    phrases: ["dusakabin silikon"]
  },
  {
    groupSlug: "su-tesisati",
    phrases: ["priz kolye", "basinc dusurucu", "dusurucu adaptor", "yukseltici dusurucu", "batarya baglanti", "batarya rekoru"]
  },
  {
    groupSlug: "pompa-hidrofor",
    phrases: ["bahce pompasi", "sulama pompasi"]
  },
  {
    groupSlug: "hortum-flex",
    phrases: ["bahce hortumu", "dus hortumu", "batarya hortumu"]
  },
  {
    groupSlug: "elektrikli-aletler",
    phrases: ["akulu boya tabancasi", "elektrikli boya tabancasi", "boya karistirici", "harc karistirici"]
  },
  {
    groupSlug: "el-aletleri",
    phrases: ["silikon tabancasi", "mum silikon tabancasi", "sosis tabancasi", "kopuk tabancasi", "mop zimpara"]
  }
];

const GROUP_RULES: GroupRule[] = [
  {
    groupSlug: "is-guvenligi",
    phrases: [
      "is guvenlik",
      "guvenlik ayakkabi",
      "is ayakkabi",
      "is eldiven",
      "eldiven",
      "koruyucu eldiven",
      "baret",
      "koruyucu gozluk",
      "toz maskesi",
      "solunum maskesi",
      "kulak koruyucu",
      "reflektorlu yelek",
      "emniyet kemeri",
      "dizlik",
      "kaynak maskesi",
      "kaynak maske",
      "maske cami"
    ]
  },
  {
    groupSlug: "temizlik-ekipmanlari",
    phrases: [
      "basincli yikama",
      "yikama makinesi",
      "yikama makinasi",
      "temizlik makinesi",
      "temizlik ekipman",
      "supurge",
      "paspas",
      "mop seti",
      "mop kovasi",
      "temizlik mopu",
      "cop kovasi",
      "cop torbasi",
      "klozet fircasi",
      "lavabo kuvet fircasi",
      "lavabo acma sustasi",
      "lavabo acma",
      "cam cekcek",
      "cekpas",
      "bulasik sunger",
      "temizlik bezi"
    ]
  },
  {
    groupSlug: "boya-kimyasal",
    phrases: [
      "silikon",
      "mastik",
      "poliuretan kopuk",
      "montaj kopugu",
      "boya",
      "vernik",
      "cila",
      "tiner",
      "astar",
      "macun",
      "yapistirici",
      "epoksi",
      "derz",
      "sivi conta",
      "teflon",
      "keten",
      "lavabo acici"
    ]
  },
  {
    groupSlug: "kaynak-lehim",
    phrases: [
      "kaynak makinesi",
      "kaynak ekipman",
      "kaynak elektrodu",
      "elektrod",
      "lehim",
      "havya",
      "salumo",
      "pirmuz",
      "kaynak torcu",
      "kaynak teli",
      "purmuz"
    ]
  },
  {
    groupSlug: "oto-servis",
    phrases: [
      "oto servis",
      "garaj kriko",
      "timsah kriko",
      "sise kriko",
      "makas kriko",
      "kriko stand",
      "aku takviye",
      "aku sarj",
      "lastik sisirme",
      "bijon",
      "gres pompasi",
      "rot cekme",
      "ayak pompasi",
      "el pompasi",
      "hava pompasi"
    ]
  },
  {
    groupSlug: "elektrik-aydinlatma",
    phrases: [
      "elektrik ekipman",
      "elektrik",
      "elektrik bandi",
      "uzatma kablosu",
      "uzatma kablo",
      "makarali uzatma kablo",
      "kablo makarasi",
      "kablo kanali",
      "kablo pabucu",
      "kablo bagi",
      "seyyar lamba",
      "projektor",
      "ampul",
      "led lamba",
      "led fener",
      "fener",
      "fis",
      "kaucuk fis",
      "priz",
      "multimetre",
      "voltmetre",
      "ampermetre"
    ]
  },
  {
    groupSlug: "su-depolari",
    phrases: ["su deposu", "su depo", "gubre tanki", "ent dikey", "ent yatay", "yatay depo", "dikey depo"]
  },
  {
    groupSlug: "kapi-zemin",
    phrases: ["laminat", "parke", "ic kapi", "kapi paneli", "kapi panel"]
  },
  {
    groupSlug: "sulama-bahce",
    phrases: [
      "sulama",
      "damlama",
      "tirpan",
      "misina",
      "cim bicme",
      "budama",
      "fidan",
      "bahce",
      "tarim",
      "ilaclama",
      "capa",
      "kurek",
      "faryap",
      "gelberi",
      "tirmik",
      "faraş kurek",
      "faras kurek",
      "koyun kirkma"
    ]
  },
  {
    groupSlug: "pompa-hidrofor",
    phrases: [
      "dalgic pompa",
      "su pompasi",
      "hidrofor",
      "santrifuj",
      "santrafuj",
      "vortex pompa",
      "jet pompa",
      "derin kuyu",
      "hidromat",
      "basinc pompasi",
      "basinc kontrol",
      "genlesme tanki",
      "pompa aksesuar",
      "pompa panosu",
      "devir daim su",
      "akaryakit aktarim"
    ]
  },
  {
    groupSlug: "musluk-batarya",
    phrases: [
      "musluk",
      "taharet",
      "tahrat",
      "perlator",
      "salmastra",
      "musluk volani",
      "batarya yedek",
      "banyo bataryasi",
      "lavabo bataryasi",
      "evye bataryasi",
      "mutfak bataryasi",
      "dus bataryasi"
    ]
  },
  {
    groupSlug: "banyo-vitrifiye",
    phrases: [
      "dusakabin",
      "el dusu",
      "el duslari",
      "dus takimi",
      "dus seti",
      "robot dus",
      "panel dus",
      "surgulu dus",
      "mafsalli dus",
      "dus basligi",
      "dus kolonu",
      "banyo mobilya",
      "banyo aksesuar",
      "klozet",
      "rezervuar",
      "sifon",
      "pisuvar",
      "evye",
      "lavabo",
      "kuvet",
      "vitrifiye",
      "havalandirma",
      "aspirator",
      "menfez",
      "otel ekipman",
      "ic takim",
      "bosaltma grubu",
      "sabunluk",
      "tuvalet kagitlik"
    ]
  },
  {
    groupSlug: "hortum-flex",
    phrases: ["hortum", "fleks", "flex hortum", "baglanti flexi"]
  },
  {
    groupSlug: "su-tesisati",
    phrases: [
      "fitting",
      "kaplin",
      "pprc",
      "pvc boru",
      "galvaniz",
      "galveniz",
      "siyah fitting",
      "sari fitting",
      "vana",
      "rekor",
      "nipel",
      "koruge",
      "manson",
      "boru dirsek",
      "boru baglanti",
      "su sayaci",
      "regulator",
      "priz kolye"
    ]
  },
  {
    groupSlug: "elektrikli-aletler",
    phrases: [
      "akulu",
      "sarjli",
      "li ion",
      "solo model",
      "yedek batarya",
      "elektrikli",
      "matkap",
      "taslama",
      "spiral makinesi",
      "dekupaj",
      "vidalama",
      "kirici delici",
      "freze",
      "polisaj",
      "planya",
      "kanal acma",
      "zincirli testere",
      "kompresor",
      "karistirici",
      "sunta kesme",
      "profil kesme",
      "mini vinc",
      "hizli sarj unitesi",
      "sarj unitesi",
      "elektropnomatik",
      "sicak hava tabancasi",
      "hava korugu",
      "agac kesme motoru",
      "gravur",
      "jenerator"
    ]
  },
  {
    groupSlug: "el-aletleri",
    phrases: [
      "lokma",
      "anahtar",
      "pense",
      "tornavida",
      "cekic",
      "testere",
      "makas",
      "keski",
      "metre",
      "su terazisi",
      "iskarpela",
      "ege",
      "raspa",
      "kargaburun",
      "alyan",
      "bits",
      "matkap ucu",
      "kesme diski",
      "zimpara",
      "mengene",
      "caraskal",
      "hubzug",
      "kesici tas",
      "murc",
      "panc",
      "buat acma",
      "maket bicagi",
      "orak",
      "tahra",
      "satir",
      "balta",
      "nacak"
    ]
  },
  {
    groupSlug: "hirdavat-baglanti",
    phrases: [
      "vida",
      "civata",
      "dubel",
      "karabina",
      "halat",
      "asma kilit",
      "mentese",
      "posta kutusu",
      "koli bandi",
      "maskeleme bandi",
      "cirtli kelepce"
    ]
  }
];

const LEGACY_GROUP_ALIASES: Record<string, string> = {
  "tesisat-baglanti-elemanlari": "su-tesisati",
  "dus-banyo": "banyo-vitrifiye",
  "pompa-su-sistemleri": "pompa-hidrofor",
  "aksesuar-yedek-parca": "hirdavat-baglanti",
  "oto-servis-ekipmanlari": "oto-servis",
  "bahce-tarim": "sulama-bahce",
  "elektrikli-el-aletleri": "elektrikli-aletler"
};

const CATALOG_TOKEN_CACHE = new Map<string, string[]>();
const CATALOG_STEM_CACHE = new Map<string, string>();
const MAX_TEXT_CACHE_ENTRIES = 50_000;

export function classifyCatalogProduct(product: ClassifiableCatalogProduct): CatalogClassification {
  const stored = product.catalogClassification;
  if (stored?.version === CATALOG_CLASSIFICATION_VERSION && isKnownGroup(stored.groupSlug)) {
    return stored;
  }

  const sourceKey = normalizeCatalogText(product.sourceKey);
  const name = normalizeCatalogText(product.name ?? product.productName ?? "");
  const specificCategories = [product.category ?? product.categoryName ?? "", ...(product.categoryPath ?? [])]
    .map(normalizeCatalogText)
    .filter((value) => value && !GENERIC_SOURCE_CATEGORIES.has(value));
  const categoryText = specificCategories.join(" ");

  if (sourceMatches(sourceKey, /forzaitalia/) && matchesAnyPhrase(name, ["flex baglanti hortumu", "flex hortum"])) {
    return buildClassification("hortum-flex", undefined, "name-rule", 0.99, "source-exception:forza-flex", name, categoryText);
  }

  const pinned = PINNED_SOURCE_RULES.find((rule) => sourceMatches(sourceKey, rule.source));
  if (pinned) {
    return buildClassification(pinned.groupSlug, pinned.categorySlug, "pinned-source", 1, `source:${sourceKey}`, name, categoryText);
  }

  const highPriorityRule = bestMatchingGroupRule(name, HIGH_PRIORITY_NAME_RULES);
  if (highPriorityRule) {
    return buildClassification(highPriorityRule.groupSlug, undefined, "name-rule", 0.98, `name-priority:${highPriorityRule.groupSlug}`, name, categoryText);
  }

  const euromixGroup = sourceKey === "euromix stock" ? classifyEuromixCategory(categoryText) : undefined;
  if (euromixGroup) {
    return buildClassification(euromixGroup, undefined, "source-category", 0.9, `euromix:${euromixGroup}`, name, categoryText);
  }

  const nameRule = bestMatchingGroupRule(name, GROUP_RULES);
  if (nameRule) {
    return buildClassification(nameRule.groupSlug, undefined, "name-rule", 0.94, `name:${nameRule.groupSlug}`, name, categoryText);
  }

  const categoryRule = bestMatchingGroupRule(categoryText, GROUP_RULES);
  if (categoryRule) {
    return buildClassification(categoryRule.groupSlug, undefined, "source-category", 0.86, `category:${categoryRule.groupSlug}`, name, categoryText);
  }

  const sourceDefault = SOURCE_DEFAULT_RULES.find((rule) => sourceMatches(sourceKey, rule.source));
  if (sourceDefault) {
    return buildClassification(sourceDefault.groupSlug, undefined, "source-default", 0.62, `source-default:${sourceKey}`, name, categoryText);
  }

  return buildClassification("hirdavat-baglanti", undefined, "fallback", 0.35, "fallback:general-hardware", name, categoryText);
}

export function canonicalizeCatalogGroupSlug(slug: string): string {
  return LEGACY_GROUP_ALIASES[slug] ?? slug;
}

export function isCatalogIndexRecord(product: Pick<ClassifiableCatalogProduct, "externalId">): boolean {
  return normalizeCatalogText(product.externalId ?? "").includes("katalog index");
}

export function catalogTextMatchesPhrase(value: string, phrase: string): boolean {
  const valueTokens = catalogTokens(value);
  const phraseTokens = catalogTokens(phrase);
  if (phraseTokens.length === 0 || phraseTokens.length > valueTokens.length) {
    return false;
  }

  for (let start = 0; start <= valueTokens.length - phraseTokens.length; start += 1) {
    const matches = phraseTokens.every((token, offset) => tokenMatches(valueTokens[start + offset] ?? "", token));
    if (matches) {
      return true;
    }
  }

  return false;
}

export function normalizeCatalogText(value: string): string {
  const turkishMap: Record<string, string> = {
    ç: "c",
    ğ: "g",
    ı: "i",
    ö: "o",
    ş: "s",
    ü: "u",
    Ç: "c",
    Ğ: "g",
    İ: "i",
    I: "i",
    Ö: "o",
    Ş: "s",
    Ü: "u"
  };

  return value
    .split("")
    .map((char) => turkishMap[char] ?? char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildClassification(
  groupSlug: string,
  forcedCategorySlug: string | undefined,
  method: CatalogClassificationMethod,
  confidence: number,
  ruleId: string,
  name: string,
  categoryText: string
): CatalogClassification {
  const group = CATALOG_TREE.find((item) => item.slug === groupSlug) ?? CATALOG_TREE.find((item) => item.slug === "hirdavat-baglanti");
  if (!group) {
    throw new Error(`Katalog ana kategorisi tanımlı değil: ${groupSlug}`);
  }

  const leaves = group.columns.flatMap((column) => column.items);
  const forcedLeaf = forcedCategorySlug ? leaves.find((leaf) => leaf.slug === forcedCategorySlug) : undefined;
  const matchedLeaf = forcedLeaf ?? bestMatchingLeaf(leaves, name, categoryText);

  return {
    version: CATALOG_CLASSIFICATION_VERSION,
    method,
    confidence,
    ruleId,
    groupSlug: group.slug,
    groupLabel: group.label,
    categorySlug: matchedLeaf?.slug ?? `${group.slug}-genel`,
    categoryLabel: matchedLeaf?.label ?? group.label
  };
}

function bestMatchingLeaf(
  leaves: Array<{ slug: string; label: string; keywords: string[] }>,
  name: string,
  categoryText: string
): { slug: string; label: string; keywords: string[] } | undefined {
  let best: { leaf: (typeof leaves)[number]; score: number } | undefined;

  for (const leaf of leaves) {
    for (const keyword of leaf.keywords) {
      const tokenBonus = normalizeCatalogText(keyword).split(" ").length;
      const score = catalogTextMatchesPhrase(name, keyword)
        ? 100 + tokenBonus
        : catalogTextMatchesPhrase(categoryText, keyword)
          ? 60 + tokenBonus
          : 0;
      if (score > (best?.score ?? 0)) {
        best = { leaf, score };
      }
    }
  }

  return best?.leaf;
}

function classifyEuromixCategory(categoryText: string): string | undefined {
  if (matchesAnyPhrase(categoryText, ["hortum", "flex", "fleks"])) {
    return "hortum-flex";
  }
  if (matchesAnyPhrase(categoryText, ["dusakabin", "el dus", "dus takim", "robot dus", "panel dus", "surgulu dus", "mafsalli dus", "banyo aksesuar", "klozet", "rezervuar", "sifon", "vitrifiye", "havalandirma", "otel ekipman", "evye"])) {
    return "banyo-vitrifiye";
  }
  if (matchesAnyPhrase(categoryText, ["musluk", "batarya", "tahrat", "taharet", "mix", "salmastra", "perlator", "volan", "serisi", "creativ", "kugu"])) {
    return "musluk-batarya";
  }
  if (matchesAnyPhrase(categoryText, ["fitting", "kaplin", "vana", "kelepce", "rekor", "nipel", "pprc", "pvc", "galvaniz", "galveniz", "su sayaci", "koruge"])) {
    return "su-tesisati";
  }
  return undefined;
}

function matchesAnyPhrase(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => catalogTextMatchesPhrase(value, phrase));
}

function bestMatchingGroupRule(value: string, rules: GroupRule[]): GroupRule | undefined {
  let best: { rule: GroupRule; score: number; order: number } | undefined;
  rules.forEach((rule, order) => {
    for (const phrase of rule.phrases) {
      if (!catalogTextMatchesPhrase(value, phrase)) {
        continue;
      }
      const normalizedPhrase = normalizeCatalogText(phrase);
      const score = normalizedPhrase.split(" ").filter(Boolean).length * 100 + normalizedPhrase.length;
      if (!best || score > best.score || (score === best.score && order < best.order)) {
        best = { rule, score, order };
      }
    }
  });
  return best?.rule;
}

function tokenMatches(valueToken: string, phraseToken: string): boolean {
  const valueStem = cachedCatalogStem(valueToken);
  const phraseStem = cachedCatalogStem(phraseToken);
  if (valueStem === phraseStem) {
    return true;
  }
  return phraseStem.length >= 5 && /^[a-z0-9]+[iu]$/.test(valueStem) && valueStem.slice(0, -1) === phraseStem;
}

function catalogTokens(value: string): string[] {
  const cached = CATALOG_TOKEN_CACHE.get(value);
  if (cached) {
    return cached;
  }

  const tokens = normalizeCatalogText(value).split(" ").filter(Boolean);
  if (CATALOG_TOKEN_CACHE.size < MAX_TEXT_CACHE_ENTRIES) {
    CATALOG_TOKEN_CACHE.set(value, tokens);
  }
  return tokens;
}

function cachedCatalogStem(token: string): string {
  const cached = CATALOG_STEM_CACHE.get(token);
  if (cached) {
    return cached;
  }

  const stem = stemCatalogToken(token);
  if (CATALOG_STEM_CACHE.size < MAX_TEXT_CACHE_ENTRIES) {
    CATALOG_STEM_CACHE.set(token, stem);
  }
  return stem;
}

function stemCatalogToken(token: string): string {
  const suffixes = ["larindan", "lerinden", "larinda", "lerinde", "larinin", "lerinin", "lari", "leri", "lar", "ler", "si"];
  const suffix = suffixes.find((candidate) => token.length >= candidate.length + 3 && token.endsWith(candidate));
  return suffix ? token.slice(0, -suffix.length) : token;
}

function sourceMatches(normalizedSourceKey: string, source: string | RegExp): boolean {
  return typeof source === "string" ? normalizedSourceKey === normalizeCatalogText(source) : source.test(normalizedSourceKey.replace(/ /g, "-"));
}

function isKnownGroup(slug: string): boolean {
  return CATALOG_TREE.some((group) => group.slug === slug);
}
