import { answerEnexChat, enexChatSchema } from "../../../../lib/enexai";
import { guardEnexRequest } from "../../../../lib/enexai-security";
import { noStoreJson, readJsonBody, RequestSecurityError } from "../../../../lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rejected = await guardEnexRequest(request, "chat");
  if (rejected) return rejected;
  try {
    const parsed = enexChatSchema.safeParse(await readJsonBody(request, 48 * 1024));
    if (!parsed.success) return noStoreJson({ error: "Lütfen daha kısa, geçerli bir mesaj gönderin." }, 400);
    return noStoreJson(await answerEnexChat(parsed.data));
  } catch (error) {
    if (error instanceof RequestSecurityError) return noStoreJson({ error: error.message }, error.status);
    return noStoreJson({ error: "EnexAI şu anda kataloğa ulaşamıyor. Lütfen tekrar deneyin." }, 503);
  }
}
