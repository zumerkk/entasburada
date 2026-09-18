import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getPresenceStore } from "../../../../lib/presence";
import { noStoreJson } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return noStoreJson({ error: "Unauthorized" }, 401);
  }
  return noStoreJson(getPresenceStore().snapshot());
}
