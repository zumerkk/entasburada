import type { MetadataRoute } from "next";
import { loadCatalogStore } from "../lib/catalog-repository";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://entasburada.com";

const staticPaths = ["", "/catalog", "/about", "/contact", "/delivery", "/technical-documents", "/corporate-purchase", "/dealer-application", "/kvkk"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const store = await loadCatalogStore();
  const products = store.products
    .filter((product) => product.status === "ACTIVE" && product.isVisible)
    .map((product) => ({
      url: `${siteUrl}/products/${product.slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6
    }));

  return [
    ...staticPaths.map((pathname) => ({
      url: `${siteUrl}${pathname}`,
      changeFrequency: "daily" as const,
      priority: pathname === "" ? 1 : 0.8
    })),
    ...products
  ];
}
