import { NextResponse } from "next/server";
import { getCurrentCustomer } from "../../../../../../../lib/customer-auth";
import { getBalancePaymentIntent } from "../../../../../../../lib/customer-balance-payment-repository";
import { getZiraatPayConfig } from "../../../../../../../lib/payment/ziraatpay";
import { noStoreJson } from "../../../../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) return noStoreJson({ error: "Müşteri girişi gerekli." }, 401);

  const { id } = await params;
  const payment = await getBalancePaymentIntent(id);
  if (
    !payment ||
    payment.customerId !== customer.id ||
    payment.status !== "pending" ||
    !payment.paymentPageUrl ||
    !isTrustedPaymentPage(payment.paymentPageUrl)
  ) {
    return noStoreJson({ error: "Devam edilebilir ödeme oturumu bulunamadı." }, 404);
  }

  return NextResponse.redirect(payment.paymentPageUrl, { status: 303 });
}

function isTrustedPaymentPage(value: string): boolean {
  try {
    const target = new URL(value);
    const configured = new URL(getZiraatPayConfig().paymentPageBaseUrl);
    const basePath = configured.pathname.replace(/\/$/, "");
    return target.origin === configured.origin && target.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}
