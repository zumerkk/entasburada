import { type NextRequest, NextResponse } from "next/server";

export function proxy(_request: NextRequest): NextResponse {
  if (process.env.ADMIN_LEGACY_APP_ENABLED !== "true") {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }
    });
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
