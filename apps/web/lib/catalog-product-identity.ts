import type { CatalogProductRecord } from "@entas/catalog";

export interface CatalogProductIdentity {
  catalogProductId?: string | undefined;
  productSlug?: string | undefined;
  sku?: string | undefined;
  productName?: string | undefined;
}

export interface CatalogProductLookup {
  byId: Map<string, CatalogProductRecord[]>;
  bySlug: Map<string, CatalogProductRecord[]>;
  byCode: Map<string, CatalogProductRecord[]>;
  byName: Map<string, CatalogProductRecord[]>;
}

export interface CatalogProductResolution {
  product?: CatalogProductRecord;
  reason?: "missing" | "ambiguous" | "mismatch";
}

export function normalizeProductIdentity(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u");
}

export function hasStrongCatalogProductIdentity(identity: CatalogProductIdentity): boolean {
  return Boolean(identity.catalogProductId?.trim() || identity.productSlug?.trim());
}

export function createCatalogProductLookup(products: CatalogProductRecord[]): CatalogProductLookup {
  const lookup: CatalogProductLookup = { byId: new Map(), bySlug: new Map(), byCode: new Map(), byName: new Map() };
  for (const product of products) {
    add(lookup.byId, product.id.trim(), product);
    add(lookup.bySlug, normalizeProductIdentity(product.slug), product);
    add(lookup.byName, normalizeProductIdentity(product.name), product);
    for (const code of [product.sku, product.barcode, product.manufacturerCode]) {
      add(lookup.byCode, normalizeProductIdentity(code), product);
    }
  }
  return lookup;
}

/** Explicit identities never fall back to a different product or a partial name. */
export function resolveCatalogProduct(lookup: CatalogProductLookup, identity: CatalogProductIdentity): CatalogProductResolution {
  const id = identity.catalogProductId?.trim() ?? "";
  const slug = normalizeProductIdentity(identity.productSlug);
  const code = normalizeProductIdentity(identity.sku);
  const name = normalizeProductIdentity(identity.productName);

  if (id || slug) {
    const matches = id ? lookup.byId.get(id) ?? [] : lookup.bySlug.get(slug) ?? [];
    if (matches.length !== 1) return { reason: matches.length ? "ambiguous" : "missing" };
    const product = matches[0]!;
    if (slug) {
      const slugMatches = lookup.bySlug.get(slug) ?? [];
      if (slugMatches.length !== 1) return { reason: slugMatches.length ? "ambiguous" : "missing" };
      if (slugMatches[0] !== product) return { reason: "mismatch" };
    }
    if (code && ![product.sku, product.barcode, product.manufacturerCode].some((value) => normalizeProductIdentity(value) === code)) {
      return { reason: "mismatch" };
    }
    if (name && normalizeProductIdentity(product.name) !== name) return { reason: "mismatch" };
    return { product };
  }

  if (code) {
    const matches = lookup.byCode.get(code) ?? [];
    if (!matches.length) return { reason: "missing" };
    const exact = name ? matches.filter((product) => normalizeProductIdentity(product.name) === name) : matches;
    if (exact.length === 1) return { product: exact[0]! };
    return { reason: exact.length ? "ambiguous" : "mismatch" };
  }

  if (name) {
    const matches = lookup.byName.get(name) ?? [];
    if (matches.length === 1) return { product: matches[0]! };
    return { reason: matches.length ? "ambiguous" : "missing" };
  }
  return { reason: "missing" };
}

function add(map: Map<string, CatalogProductRecord[]>, key: string, product: CatalogProductRecord): void {
  if (!key) return;
  const matches = map.get(key);
  if (matches) {
    if (!matches.includes(product)) matches.push(product);
  } else {
    map.set(key, [product]);
  }
}
