import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://entasburada.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/cart", "/orders", "/quote", "/quick-order", "/login", "/api"]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
