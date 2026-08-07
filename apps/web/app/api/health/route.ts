import { assertProductionSecurityConfiguration } from "../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    assertProductionSecurityConfiguration();
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    ok: true,
    timestamp: new Date().toISOString()
  }, { headers: { "Cache-Control": "no-store" } });
}
