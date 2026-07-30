import { NextResponse } from "next/server";
import { getOrderByTrackingCode } from "../../../../../lib/commercial-repository";
import { convertToTry } from "../../../../../lib/fx";
import { isValidInstallmentCount, priceForInstallment } from "../../../../../lib/installments";
import { buildMerchantPaymentId, createPaymentSession, isDirectPostEnabled } from "../../../../../lib/payment/ziraatpay";

export const dynamic = "force-dynamic";

/**
 * Bir siparişi kartla ödemeyi başlatır.
 * Body: { trackingCode }. ZiraatPay HPP oturumu açar, yönlendirme adresini döner.
 * MERCHANTPAYMENTID olarak trackingCode kullanılır (callback'te geri lookup için).
 */
export async function POST(request: Request): Promise<Response> {
  let trackingCode = "";
  let installments = 1;
  try {
    const body = (await request.json()) as { trackingCode?: string; installments?: number };
    trackingCode = (body.trackingCode ?? "").trim();
    if (body.installments !== undefined && isValidInstallmentCount(body.installments)) {
      installments = Math.trunc(Number(body.installments));
    }
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

  const customerIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1";

  try {
    // Tahsilat TRY yapılır. USD/EUR fiyatlı sipariş TCMB kuruyla çevrilir;
    // kur alınamazsa hata fırlar ve YANLIŞ tutarla tahsilat yapılmaz.
    const charge = await convertToTry(parseAmount(order.totalAmount), order.currency);
    // Taksit farkı müşteriye yansır (tek çekimde tutar değişmez).
    const plan = priceForInstallment(charge.amount, installments);
    // Satır tutarları da taksit oranıyla ölçeklenir; ORDERITEMS toplamı AMOUNT ile tutarlı kalsın.
    const rate = charge.rate * (charge.amount > 0 ? plan.total / charge.amount : 1);

    const session = await createPaymentSession({
      // Her deneme benzersiz ID alır; aksi halde taksit değişince ERR10118 döner.
      merchantPaymentId: buildMerchantPaymentId(order.trackingCode),
      amount: plan.total.toFixed(2),
      installments,
      currency: "TRY",
      returnUrl: `${siteUrl}/api/payments/ziraatpay/callback`,
      customerId: order.email || order.dealerUser,
      customerName: order.companyName,
      customerEmail: order.email,
      customerPhone: order.phone,
      customerIp,
      orderItems: order.items.map((item) => ({
        productCode: item.sku,
        name: item.productName,
        quantity: Number(item.quantity) || 1,
        // Satır tutarları da aynı kurla çevrilir; toplamla tutarlı kalsın.
        amount: Math.round(parseAmount(item.lineTotal) * rate * 100) / 100
      }))
    });
    // DirectPost açıksa kart formu bizde açılır ve taksit KİLİTLİ olur.
    // Kapalıysa (ZiraatPay etkinleştirmemişse) HPP'ye yönlendirilir — ödeme durmaz.
    return NextResponse.json({
      ...(isDirectPostEnabled() ? { directPostUrl: session.directPostUrl } : {}),
      redirectUrl: session.redirectUrl,
      installments,
      amount: plan.total.toFixed(2)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ödeme başlatılamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function parseAmount(value: string): number {
  const parsed = parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
