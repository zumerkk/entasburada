import { getEnexContext } from "../../../../lib/enexai";
import { guardEnexRequest } from "../../../../lib/enexai-security";
import { noStoreJson } from "../../../../lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rejected = await guardEnexRequest(request, "context");
  if (rejected) return rejected;
  try {
    const pathname = new URL(request.url).searchParams.get("pathname") ?? "/";
    if (pathname.length > 500) return noStoreJson({ error: "Sayfa adresi çok uzun." }, 400);
    return noStoreJson(await getEnexContext(pathname));
  } catch {
    return noStoreJson({ error: "Katalog bilgisine şu anda ulaşılamıyor. Lütfen tekrar deneyin." }, 503);
  }
}
