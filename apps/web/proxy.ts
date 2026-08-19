import { type NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest): NextResponse {
  const responseHeaders = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache"
  });
  if (SAFE_METHODS.has(request.method.toUpperCase())) return NextResponse.next({ headers: responseHeaders });

  const pathname = request.nextUrl.pathname;
  const maxBytes = requestBodyLimit(pathname);
  if (request.headers.has("transfer-encoding")) {
    return NextResponse.json({ error: "Aktarım kodlamalı istek gövdeleri kabul edilmez." }, { status: 400, headers: responseHeaders });
  }
  const contentLength = request.headers.get("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) {
    return NextResponse.json({ error: "Geçerli Content-Length başlığı zorunludur." }, { status: 411, headers: responseHeaders });
  }
  const declaredLength = Number(contentLength);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
    return NextResponse.json({ error: "İstek gövdesi izin verilen sınırı aşıyor." }, { status: 413, headers: responseHeaders });
  }

  // Ödeme sağlayıcısının sunucudan/tarayıcıdan POST ettiği imzalı callback kendi
  // kriptografik doğrulamasını yapar; tarayıcı origin kontrolünden bilinçli istisnadır.
  if (
    pathname === "/api/payments/ziraatpay/callback" ||
    pathname === "/api/payments/ziraatpay/balance/callback"
  ) {
    return NextResponse.next({ headers: responseHeaders });
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403, headers: responseHeaders });
  }

  const origin = request.headers.get("origin");
  const allowedOrigins = new Set([request.nextUrl.origin]);
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    try {
      allowedOrigins.add(new URL(configuredSite).origin);
    } catch {
      return NextResponse.json({ error: "Server origin is misconfigured" }, { status: 500, headers: responseHeaders });
    }
  }
  if (!origin) {
    return NextResponse.json({ error: "Request origin required" }, { status: 403, headers: responseHeaders });
  }
  try {
    if (!allowedOrigins.has(new URL(origin).origin)) {
      return NextResponse.json({ error: "Request origin rejected" }, { status: 403, headers: responseHeaders });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers: responseHeaders });
  }

  return NextResponse.next({ headers: responseHeaders });
}

function requestBodyLimit(pathname: string): number {
  if (pathname === "/api/admin/import/pdf") {
    return Math.max(5, Number(process.env.CATALOG_PDF_MAX_MB) || 120) * 1024 * 1024 + 64 * 1024;
  }
  if (pathname === "/api/admin/import/xml") return 21 * 1024 * 1024;
  return 1024 * 1024;
}

export const config = { matcher: "/api/:path*" };
