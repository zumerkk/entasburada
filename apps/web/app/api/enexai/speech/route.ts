import { z } from "zod";
import { enexAiConfigured } from "../../../../lib/enexai";
import { guardEnexRequest } from "../../../../lib/enexai-security";
import { noStoreJson, readJsonBody, RequestSecurityError } from "../../../../lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const speechSchema = z.object({ text: z.string().trim().min(1).max(1800) }).strict();

export async function POST(request: Request): Promise<Response> {
  const rejected = await guardEnexRequest(request, "speech");
  if (rejected) return rejected;
  let input: z.infer<typeof speechSchema>;
  try {
    const parsed = speechSchema.safeParse(await readJsonBody(request, 10 * 1024));
    if (!parsed.success) return noStoreJson({ error: "Seslendirilecek metin çok uzun veya geçersiz." }, 400);
    input = parsed.data;
  } catch (error) {
    return noStoreJson({ error: error instanceof RequestSecurityError ? error.message : "Ses isteği okunamadı." }, error instanceof RequestSecurityError ? error.status : 400);
  }
  if (!enexAiConfigured()) return noStoreJson({ error: "OpenAI sesi şu anda bağlı değil. Yazışarak devam edebilirsiniz." }, 503);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_ENEX_TTS_MODEL?.trim() || "gpt-4o-mini-tts", voice: process.env.OPENAI_ENEX_VOICE?.trim() || "coral", input: input.text, response_format: "mp3", instructions: "Türkçe konuş. EnexAI, ENTAŞBURADA'nın sıcak ve yardımsever alışveriş asistanıdır. Doğal, net, sakin bir tempo kullan. Verilen metni değiştirmeden seslendir." })
    });
    if (!response.ok || !response.body) throw new Error("ENEX_SPEECH_UNAVAILABLE");
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return noStoreJson({ error: "OpenAI ses bağlantısı kurulamadı. Yazışarak devam edebilirsiniz." }, 503);
  }
}
