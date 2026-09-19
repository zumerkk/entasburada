import "server-only";
import { consumeRateLimit } from "./rate-limit";
import { getClientAddress, noStoreJson, trustedMutationError } from "./security";

export async function guardEnexRequest(request: Request, kind: "chat" | "speech" | "context"): Promise<Response | null> {
  const originError = trustedMutationError(request);
  if (originError) return originError;
  if (request.headers.get("sec-fetch-site") === "cross-site") return noStoreJson({ error: "Bu istek yalnızca ENTAŞBURADA üzerinden yapılabilir." }, 403);
  try {
    const result = await consumeRateLimit(`enexai:${kind}`, getClientAddress(request.headers), { limit: kind === "speech" ? 12 : kind === "chat" ? 24 : 60, windowMs: 60_000 });
    if (!result.allowed) return limited(result.retryAfterSeconds);
    // A deployment-wide ceiling prevents rotating/forged client addresses from bypassing all paid-API cost limits.
    if (kind !== "context") {
      const global = await consumeRateLimit(`enexai:global:${kind}`, "deployment", { limit: kind === "speech" ? 40 : 120, windowMs: 60_000 });
      if (!global.allowed) return limited(global.retryAfterSeconds);
    }
    return null;
  } catch {
    return noStoreJson({ error: "EnexAI şu anda bağlantıyı doğrulayamıyor. Lütfen tekrar deneyin." }, 503);
  }
}

function limited(seconds: number): Response {
  return Response.json({ error: "Biraz hızlı ilerledik. Kısa bir süre sonra yeniden deneyin." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } });
}
