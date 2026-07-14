// Koçtaş tarzı derin kategori ağacı. Her yaprak, ürün eşleştirmesi için anahtar
// kelime taşır; anahtar kelimeler ürünün kategori + kategoriYolu + ad + marka + sku
// birleşimine karşı aranır (bkz. productMatchesKeywords).

export interface CatalogTreeLeaf {
  slug: string;
  label: string;
  keywords: string[];
}

export interface CatalogTreeColumn {
  heading: string;
  items: CatalogTreeLeaf[];
}

export interface CatalogTreeCategory {
  slug: string;
  label: string;
  icon: string;
  keywords: string[];
  columns: CatalogTreeColumn[];
}

export const CATALOG_TREE: CatalogTreeCategory[] = [
  {
    slug: "su-tesisati",
    label: "Su Tesisatı & Bağlantı",
    icon: "wrench",
    keywords: [
      "fitting",
      "fittings",
      "kaplin",
      "kelepce",
      "kelepçe",
      "vana",
      "rekor",
      "nipel",
      "galvaniz",
      "galveniz",
      "pprc",
      "pvc boru",
      "duplex",
      "su sayac",
      "regülatör",
      "regületör",
      "koruge",
      "baglanti eleman",
      "bağlantı eleman"
    ],
    columns: [
      {
        heading: "Fittingsler",
        items: [
          { slug: "sari-fittings", label: "Sarı Fittingsler", keywords: ["sari fitting", "sarı fitting"] },
          { slug: "pprc-fittings", label: "PPRC Fittingsler", keywords: ["pprc"] },
          { slug: "galvaniz-fittings", label: "Galvaniz Fittingsler", keywords: ["galveniz", "galvaniz fitting", "galvaniz fittings"] },
          { slug: "siyah-fittings", label: "Siyah Fittingsler", keywords: ["siyah fitting"] },
          { slug: "pvc-fittings", label: "PVC & Duplex Fittings", keywords: ["pvc fitting", "pvc boru", "duplex"] },
          { slug: "kaplin-grubu", label: "Kaplin Grubu", keywords: ["kaplin"] }
        ]
      },
      {
        heading: "Vanalar",
        items: [
          { slug: "kuresel-vana", label: "Küresel Vanalar", keywords: ["kuresel vana", "küresel vana"] },
          { slug: "siber-vana", label: "Şiber Vanalar", keywords: ["siber vana", "şiber vana"] },
          { slug: "stop-vana", label: "Stop Vanalar", keywords: ["stop vana"] },
          { slug: "radyator-vana", label: "Radyatör Vanaları", keywords: ["radyator vana", "radyatör vana"] },
          { slug: "kollektor-vana", label: "Kollektör Vanaları", keywords: ["kollektor", "kollektör"] },
          { slug: "mini-vana", label: "Mini & Küresel Musluk Vanaları", keywords: ["mini vana", "kuresel musluk", "küresel musluk"] }
        ]
      },
      {
        heading: "Bağlantı & Ölçü",
        items: [
          { slug: "kelepceler", label: "Kelepçeler", keywords: ["kelepce", "kelepçe"] },
          { slug: "rekor-conta", label: "Rekor & Contalar", keywords: ["rekor", "conta"] },
          { slug: "nipeller", label: "Nipeller", keywords: ["nipel"] },
          { slug: "su-sayaci", label: "Su Sayaçları", keywords: ["su sayac", "su sayaç"] },
          { slug: "regulator-basinc", label: "Regülatör & Basınç", keywords: ["regülatör", "regületör", "basinc malzeme", "basınç malzeme"] },
          { slug: "koruge-ek", label: "Koruge & Ek Parça", keywords: ["koruge"] }
        ]
      }
    ]
  },
  {
    slug: "hortum-flex",
    label: "Hortum & Flex",
    icon: "cable",
    keywords: ["hortum", "flex", "fleks"],
    columns: [
      {
        heading: "Flex Hortumlar",
        items: [
          { slug: "su-flex", label: "Su Flex Hortumları", keywords: ["su flex"] },
          { slug: "gaz-flex", label: "Gaz Flex Hortumları", keywords: ["gaz flex"] },
          { slug: "makine-hortum", label: "Makine Hortumları", keywords: ["makine hortum"] }
        ]
      },
      {
        heading: "Duş & Bahçe Hortumları",
        items: [
          { slug: "dus-hortum", label: "Duş Hortumları", keywords: ["dus hortum", "duş hortum"] },
          { slug: "bahce-hortum", label: "Bahçe Hortumları", keywords: ["bahce hortum", "bahçe hortum"] },
          { slug: "genel-hortum", label: "Tüm Hortumlar", keywords: ["hortum"] }
        ]
      }
    ]
  },
  {
    slug: "musluk-batarya",
    label: "Musluk & Batarya",
    icon: "droplets",
    keywords: [
      "musluk",
      "batarya",
      "tahrat",
      "taharet",
      "aritma musluk",
      "arıtma musluk",
      "terkoz",
      "semaver",
      "volan",
      "salmastra",
      "perlator",
      "perlatör",
      "mix kol",
      "serisi",
      "creativ",
      "kugu"
    ],
    columns: [
      {
        heading: "Bataryalar",
        items: [
          { slug: "bataryalar", label: "Bataryalar", keywords: ["batarya"] },
          { slug: "batarya-modelleri", label: "Batarya Model Serileri", keywords: ["serisi", "creativ", "kugu"] },
          { slug: "batarya-yedek", label: "Batarya Yedek Parçaları", keywords: ["batarya yedek", "batarya nipel", "batarya dirsek", "mix kol", "mix tekli"] }
        ]
      },
      {
        heading: "Musluklar",
        items: [
          { slug: "tahrat-musluk", label: "Tahrat Muslukları", keywords: ["tahrat", "taharet"] },
          { slug: "aritma-musluk", label: "Arıtma Muslukları", keywords: ["aritma musluk", "arıtma musluk"] },
          { slug: "terkoz-musluk", label: "Terkoz Muslukları", keywords: ["terkoz", "musluk tepe"] },
          { slug: "semaver-musluk", label: "Semaver & Plastik Musluklar", keywords: ["semaver", "plastik musluk"] }
        ]
      },
      {
        heading: "Yedek & Aksesuar",
        items: [
          { slug: "musluk-volanlari", label: "Musluk Volanları", keywords: ["volan"] },
          { slug: "salmastralar", label: "Salmastralar", keywords: ["salmastra"] },
          { slug: "perlator", label: "Perlatör & Boru Uçları", keywords: ["perlator", "perlatör", "boru uc", "boru uç"] },
          { slug: "musluk-kapak", label: "Musluk Kapak & Conta", keywords: ["musluk conta", "kapak takim", "musluk kapak"] },
          { slug: "musluk-ayna", label: "Batarya & Musluk Aynaları", keywords: ["musluk ayna", "batarya ayna", "musluk ayna"] }
        ]
      }
    ]
  },
  {
    slug: "banyo-vitrifiye",
    label: "Banyo & Vitrifiye",
    icon: "showerhead",
    keywords: ["banyo", "dus", "duş", "vitrifiye", "klozet", "rezervuar", "sifon", "evye", "lavabo", "otel ekipman", "havalandirma", "havalandırma", "aspirator", "aspiratör", "menfez", "ic takim", "iç takım", "bosaltma", "boşaltma"],
    columns: [
      {
        heading: "Banyo Mobilya & Aksesuar",
        items: [
          { slug: "banyo-mobilya", label: "Banyo Mobilyaları", keywords: ["banyo mobilya", "banyo ve mutfak"] },
          { slug: "banyo-aksesuar", label: "Banyo Aksesuarları", keywords: ["banyo aksesuar"] },
          { slug: "evyeler", label: "Evyeler", keywords: ["evye"] },
          { slug: "banyo-havalandirma", label: "Banyo Havalandırma", keywords: ["havalandirma", "havalandırma", "aspirator", "aspiratör", "banyo menfez", "menfez"] },
          { slug: "otel-ekipman", label: "Otel Ekipmanları", keywords: ["otel ekipman"] }
        ]
      },
      {
        heading: "Duş Sistemleri",
        items: [
          { slug: "el-dusu", label: "El Duşları", keywords: ["el dus", "el duş"] },
          { slug: "dus-takimi", label: "Duş Takımları", keywords: ["dus takim", "duş takım"] },
          { slug: "mafsalli-dus", label: "Mafsallı Duşlar", keywords: ["mafsalli dus", "mafsallı duş"] },
          { slug: "robot-dus", label: "Robot Duşlar", keywords: ["robot dus", "robot duş"] },
          { slug: "panel-surgulu-dus", label: "Panel & Sürgülü Duşlar", keywords: ["panel dus", "panel duş", "surgulu dus", "sürgülü duş"] }
        ]
      },
      {
        heading: "Klozet, Rezervuar & Sifon",
        items: [
          { slug: "klozet-kapak", label: "Klozet & Kapaklar", keywords: ["klozet"] },
          { slug: "gomme-rezervuar", label: "Gömme Rezervuar & İç Takım", keywords: ["rezervuar", "ic takim", "iç takım", "bosaltma grubu", "boşaltma grubu"] },
          { slug: "vitrifiye", label: "Vitrifiye Malzemeleri", keywords: ["vitrifiye", "vit. montaj", "vit montaj"] },
          { slug: "yer-sifonu", label: "Yer Sifonları", keywords: ["yer sifon"] },
          { slug: "koruklu-sifon", label: "Körüklü & Taşlı Sifonlar", keywords: ["koruklu sifon", "körüklü sifon", "tasli sifon", "taşlı sifon"] },
          { slug: "genel-sifon", label: "Tüm Sifonlar", keywords: ["sifon"] }
        ]
      }
    ]
  },
  {
    slug: "pompa-hidrofor",
    label: "Pompa & Hidrofor",
    icon: "gauge",
    keywords: ["pompa", "dalgic", "dalgıç", "hidrofor", "vortex", "santrifuj", "santrifüj", "santrafuj", "jet pomp", "flator", "flatör", "kademeli"],
    columns: [
      {
        heading: "Pompalar",
        items: [
          { slug: "dalgic-pompa", label: "Dalgıç Pompalar", keywords: ["dalgic pomp", "dalgıç pomp"] },
          { slug: "santrifuj-pompa", label: "Santrifüj Pompalar", keywords: ["santrifuj", "santrifüj", "santrafuj", "santrafüj"] },
          { slug: "vortex-pompa", label: "Vortex Pompalar", keywords: ["vortex"] },
          { slug: "jet-pompa", label: "Jet & Kendinden Emişli Pompalar", keywords: ["jet pomp", "kendinden emis", "kendinden emiş"] },
          { slug: "cok-kademeli-pompa", label: "Çok Kademeli Pompalar", keywords: ["cok kademeli", "çok kademeli", "milli pomp"] },
          { slug: "benzinli-pompa", label: "Benzinli Su Pompaları", keywords: ["benzinli su pomp", "2 zamanli", "2 zamanlı"] }
        ]
      },
      {
        heading: "Hidrofor & Aksesuar",
        items: [
          { slug: "hidrofor", label: "Hidroforlar", keywords: ["hidrofor"] },
          { slug: "hidrofor-tank", label: "Hidrofor Tankları", keywords: ["hidrofor tank"] },
          { slug: "pompa-aksesuar", label: "Pompa Aksesuarları", keywords: ["pompalari aksesuar", "pompaları aksesuar", "pompa aksesuar"] },
          { slug: "basinc-kontrol", label: "Basınç Kontrol & Flatör", keywords: ["basinc kontrol", "basınç kontrol", "flator", "flatör"] },
          { slug: "aktarim-pompa", label: "Aktarım & El Pompaları", keywords: ["akaryakit", "akaryakıt", "devir daim", "ayak pomp", "el pomp"] }
        ]
      }
    ]
  },
  {
    slug: "sulama-bahce",
    label: "Sulama & Bahçe",
    icon: "sprout",
    keywords: ["sulama", "damlama", "misina", "cim bicme", "çim biçme", "fidan", "bahce sulama", "bahçe sulama"],
    columns: [
      {
        heading: "Sulama Sistemleri",
        items: [
          { slug: "sulama-sistemleri", label: "Sulama Sistemleri", keywords: ["sulama"] },
          { slug: "damlama", label: "Damlama Sulama", keywords: ["damlama"] },
          { slug: "bahce-sulama", label: "Bahçe Sulama Grubu", keywords: ["bahce sulama", "bahçe sulama"] }
        ]
      },
      {
        heading: "Bahçe Makineleri",
        items: [
          { slug: "cim-bicme", label: "Çim Biçme Makineleri", keywords: ["cim bicme", "çim biçme"] },
          { slug: "misina", label: "Misinalar", keywords: ["misina"] },
          { slug: "fidan-ekme", label: "Fidan Ekme & Bahçe Aletleri", keywords: ["fidan ekme", "koyun kirkma", "koyun kırkma", "kurek grubu", "kürek grubu"] }
        ]
      }
    ]
  },
  {
    slug: "el-aletleri",
    label: "El Aletleri",
    icon: "hammer",
    keywords: [
      "el aleti",
      "el aletleri",
      "teknik hirdavat",
      "teknik hırdavat",
      "lokma",
      "anahtar",
      "pense",
      "tornavida",
      "cekic",
      "çekiç",
      "kriko",
      "caraskal",
      "hubzug",
      "testere",
      "orak",
      "tahra",
      "satir",
      "satır"
    ],
    columns: [
      {
        heading: "El Aletleri",
        items: [
          { slug: "lokmalar", label: "Lokma & Lokma Takımları", keywords: ["lokma"] },
          { slug: "anahtarlar", label: "Anahtarlar", keywords: ["anahtar", "t kolu"] },
          { slug: "pense-tornavida", label: "Pense & Tornavida", keywords: ["pense", "tornavida", "kargaburun", "yan keski"] },
          { slug: "cekic-testere", label: "Çekiç & Testereler", keywords: ["cekic", "çekiç", "testere", "agac kesme", "ağaç kesme"] },
          { slug: "orak-tahra", label: "Orak, Tahra & Satır", keywords: ["orak", "tahra", "satir", "satır"] }
        ]
      },
      {
        heading: "Kaldırma & Kriko",
        items: [
          { slug: "sise-kriko", label: "Şişe Krikolar", keywords: ["sise kriko", "şişe kriko"] },
          { slug: "garaj-kriko", label: "Garaj & Timsah Krikolar", keywords: ["garaj kriko", "timsah kriko", "makas kriko", "kriko stand"] },
          { slug: "caraskal", label: "Caraskal & Hubzug", keywords: ["caraskal", "hubzug"] },
          { slug: "zimpara-disk", label: "Zımpara & Disk", keywords: ["flap disk", "zimpara", "zımpara", "ege disk", "eğe disk"] }
        ]
      }
    ]
  },
  {
    slug: "elektrikli-aletler",
    label: "Elektrikli & Akülü Aletler",
    icon: "drill",
    keywords: [
      "matkap",
      "taslama",
      "taşlama",
      "spiral",
      "dekupaj",
      "vidalama makine",
      "zincirli testere",
      "kompresor",
      "kompresör",
      "polisaj",
      "karistirici",
      "karıştırıcı",
      "planya",
      "hilti"
    ],
    columns: [
      {
        heading: "Kesme & Delme",
        items: [
          { slug: "matkap", label: "Matkaplar", keywords: ["matkap"] },
          { slug: "spiral-taslama", label: "Spiral & Taşlama", keywords: ["spiral", "taslama makine", "taşlama makine"] },
          { slug: "dekupaj", label: "Dekupaj Testereler", keywords: ["dekupaj"] },
          { slug: "profil-kesme", label: "Profil Kesme", keywords: ["profil kesme"] },
          { slug: "vidalama", label: "Vidalama Makineleri", keywords: ["vidalama"] }
        ]
      },
      {
        heading: "Testere & Diğer",
        items: [
          { slug: "zincirli-testere", label: "Zincirli Testereler", keywords: ["zincirli testere", "hilti"] },
          { slug: "karistirici", label: "Karıştırıcılar", keywords: ["karistirici", "karıştırıcı"] },
          { slug: "polisaj", label: "Polisaj Makineleri", keywords: ["polisaj"] },
          { slug: "kompresor", label: "Kompresörler", keywords: ["kompresor", "kompresör"] },
          { slug: "planya-diger", label: "Planya & Diğer", keywords: ["planya", "kanal acma", "kanal açma", "zimpara makine", "zımpara makine", "hava ufleme", "hava üfleme"] }
        ]
      }
    ]
  },
  {
    slug: "boya-kimyasal",
    label: "Boya & Yapı Kimyasalları",
    icon: "paint-roller",
    keywords: ["boya", "silikon", "mastik", "kopuk", "köpük", "sivi conta", "sıvı conta", "teflon", "macun", "keten", "lavabo acici", "lavabo açıcı", "kimyasal"],
    columns: [
      {
        heading: "Boya",
        items: [{ slug: "boyalar", label: "Boyalar & Yapı Kimyasalları", keywords: ["boya"] }]
      },
      {
        heading: "Yapı Kimyasalları",
        items: [
          { slug: "silikon-mastik", label: "Silikon, Mastik & Köpük", keywords: ["silikon", "mastik", "kopuk", "köpük"] },
          { slug: "sivi-conta-teflon", label: "Sıvı Conta & Teflon", keywords: ["sivi conta", "sıvı conta", "teflon"] },
          { slug: "macun-keten", label: "Macun & Keten", keywords: ["macun", "keten"] },
          { slug: "lavabo-acici", label: "Lavabo Açıcılar", keywords: ["lavabo acici", "lavabo açıcı"] }
        ]
      }
    ]
  },
  {
    slug: "kapi-zemin",
    label: "Kapı & Zemin",
    icon: "door-open",
    keywords: ["kapi", "kapı", "panel", "laminat", "parke"],
    columns: [
      {
        heading: "Kapılar",
        items: [{ slug: "ic-kapi", label: "İç Kapı & Kapı Panelleri", keywords: ["ic kapi", "iç kapı", "kapi panel", "kapı panel"] }]
      },
      {
        heading: "Zemin Kaplama",
        items: [{ slug: "laminat-parke", label: "Laminat Parke", keywords: ["laminat", "parke"] }]
      }
    ]
  },
  {
    slug: "su-depolari",
    label: "Su Depoları",
    icon: "container",
    keywords: ["su depo", "su deposu", "yatay depo", "dikey depo", "gubre tank", "gübre tank"],
    columns: [
      {
        heading: "Depolar & Tanklar",
        items: [
          { slug: "su-deposu", label: "Su Depoları", keywords: ["su depo", "su deposu", "yatay depo", "dikey depo", "ent yatay", "ent dikey"] },
          { slug: "gubre-tanki", label: "Gübre Tankları", keywords: ["gubre tank", "gübre tank"] }
        ]
      }
    ]
  },
  {
    slug: "is-guvenligi",
    label: "İş Güvenliği",
    icon: "hard-hat",
    keywords: ["is guvenlik", "iş güvenlik", "eldiven", "baret", "gozluk", "gözlük", "maske", "ayakkabi", "ayakkabı", "is elbise", "iş elbise"],
    columns: [
      {
        heading: "Koruyucu Donanım",
        items: [
          { slug: "is-ayakkabisi", label: "İş Güvenlik Ayakkabıları", keywords: ["is ayakkab", "iş ayakkab", "guvenlik ayakkab", "güvenlik ayakkab"] },
          { slug: "is-eldiveni", label: "İş Eldivenleri", keywords: ["eldiven"] },
          { slug: "genel-guvenlik", label: "Baret, Gözlük & Genel", keywords: ["is guvenlik", "iş güvenlik", "baret", "gozluk", "gözlük", "maske", "is elbise", "iş elbise"] }
        ]
      }
    ]
  }
];

export function flattenCatalogTree(): CatalogTreeLeaf[] {
  const leaves: CatalogTreeLeaf[] = [];
  for (const category of CATALOG_TREE) {
    leaves.push({ slug: category.slug, label: category.label, keywords: category.keywords });
    for (const column of category.columns) {
      for (const item of column.items) {
        leaves.push(item);
      }
    }
  }
  return leaves;
}
