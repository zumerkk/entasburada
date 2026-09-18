import { getCurrentCustomer } from "../../../lib/customer-auth";
import { getPresenceStore, isValidPresenceSessionId, normalizePresencePath } from "../../../lib/presence";
import { getClientAddress, readJsonBody } from "../../../lib/security";

export const dynamic = "force-dynamic";

/** Mağaza sayfalarının "hâlâ buradayım" sinyali; admin panelindeki online sayacını besler. */
export async function POST(request: Request): Promise<Response> {
  const store = getPresenceStore();
  if (!store.allow(getClientAddress(request.headers))) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: { sessionId?: unknown; path?: unknown };
  try {
    body = (await readJsonBody<{ sessionId?: unknown; path?: unknown }>(request, 2 * 1024)) ?? {};
  } catch {
    return new Response(null, { status: 400 });
  }

  const path = normalizePresencePath(body.path);
  if (!isValidPresenceSessionId(body.sessionId) || !path) {
    return new Response(null, { status: 204 });
  }

  const customer = await getCurrentCustomer().catch(() => null);
  store.record(
    body.sessionId,
    path,
    customer ? { customerId: customer.id, companyName: customer.companyName, authorizedPerson: customer.authorizedPerson } : null
  );
  return new Response(null, { status: 204 });
}
