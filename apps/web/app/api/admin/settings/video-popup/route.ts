import { z } from "zod";
import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { getPublicVideoPopupSettings, saveVideoPopupSettings } from "../../../../../lib/brand-settings";

export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  videoUrl: z.string().optional(),
  posterUrl: z.string().optional(),
  ctaText: z.string().optional(),
  ctaHref: z.string().optional(),
  frequency: z.enum(["every_visit", "daily", "weekly", "first_visit", "off"]).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  showToGuests: z.boolean().optional(),
  showToCustomers: z.boolean().optional(),
  segmentTargets: z.array(z.string()).optional(),
  closeOnOutsideClick: z.boolean().optional(),
  closeOnEsc: z.boolean().optional(),
  autoCloseOnEnded: z.boolean().optional()
});

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

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid video popup settings" }, { status: 400 });
  }

  return Response.json({ videoPopup: await saveVideoPopupSettings(parsed.data) });
}
