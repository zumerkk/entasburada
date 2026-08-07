import { z } from "zod";
import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { getPublicVideoPopupSettings, saveVideoPopupSettings } from "../../../../../lib/brand-settings";
import { readJsonBody, requestErrorResponse } from "../../../../../lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2_000).optional(),
  videoUrl: z.string().trim().max(500).optional(),
  posterUrl: z.string().trim().max(500).optional(),
  ctaText: z.string().trim().max(120).optional(),
  ctaHref: z.string().trim().max(500).optional(),
  frequency: z.enum(["every_visit", "daily", "weekly", "first_visit", "off"]).optional(),
  startsAt: z.string().trim().max(80).optional(),
  endsAt: z.string().trim().max(80).optional(),
  showToGuests: z.boolean().optional(),
  showToCustomers: z.boolean().optional(),
  segmentTargets: z.array(z.string().trim().max(80)).max(20).optional(),
  closeOnOutsideClick: z.boolean().optional(),
  closeOnEsc: z.boolean().optional(),
  autoCloseOnEnded: z.boolean().optional()
}).strict();

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await getPublicVideoPopupSettings());
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 32 * 1024));
    if (!parsed.success) return Response.json({ error: "Invalid video popup settings" }, { status: 400 });
    return Response.json({ videoPopup: await saveVideoPopupSettings(parsed.data) });
  } catch (error) {
    return requestErrorResponse(error, "Video popup settings could not be saved");
  }
}
