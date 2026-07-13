import { getPublicVideoPopupSettings } from "../../../../lib/brand-settings";
import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { isInsideDateRange } from "../../../../lib/video-popup-policy";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const customer = await getCurrentCustomer();
  const settings = await getPublicVideoPopupSettings(customer?.segment);
  const isGuest = !customer;
  const segmentAllowed = settings.segmentTargets.length === 0 || (customer ? settings.segmentTargets.includes(customer.segment) : false);
  const enabled =
    settings.enabled &&
    isInsideDateRange(new Date(), settings.startsAt, settings.endsAt) &&
    ((isGuest && settings.showToGuests) || (!isGuest && settings.showToCustomers && segmentAllowed));

  return Response.json({
    ...settings,
    enabled
  });
}
