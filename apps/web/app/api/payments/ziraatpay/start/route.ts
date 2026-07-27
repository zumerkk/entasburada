import { NextResponse } from "next/server";
import { getOrderByTrackingCode } from "../../../../../lib/commercial-repository";
import { createPaymentSession } from "../../../../../lib/payment/ziraatpay";

export const dynamic = "force-dynamic";

/**
 * Bir siparişi kartla ödemeyi başlatır.
 * Body: { trackingCode }. ZiraatPay HPP oturumu açar, yönlendirme adresini döner.
 * MERCHANTPAYMENTID olarak trackingCode kullanılır (callback'te geri lookup için).
 */
export async function POST(request: Request): Promise<Response> {
  let trackingCode = "";
  try {
    const body = (await request.json()) as { trackingCode?: string };
    trackingCode = (body.trackingCode ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (!trackingCode) {
    return NextResponse.json({ error: "trackingCode zorunlu." }, { status: 400 });
  }

  const order = await getOrderByTrackingCode(trackingCode);
  if (!order) {
    return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  }
  if (order.status !== "PAYMENT_PENDING") {
    return NextResponse.json(
      { error: `Bu sipariş ödemeye uygun değil (durum: ${order.status}).` },
      { status: 409 }
    );
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL tanımlı değil." }, { status: 500 });
  }

  try {
    const session = await createPaymentSession({
      merchantPaymentId: order.trackingCode,
      amount: order.totalAmount,
      currency: "TRY",
      returnUrl: `${siteUrl}/api/payments/ziraatpay/callback`,
      customerId: order.email || order.dealerUser,
      customerName: order.companyName,
      customerEmail: order.email
    });
    return NextResponse.json({ redirectUrl: session.redirectUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ödeme başlatılamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
