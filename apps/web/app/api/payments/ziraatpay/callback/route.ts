import { NextResponse } from "next/server";
import { getOrderByTrackingCode, updateOrderOperation } from "../../../../../lib/commercial-repository";
import { trackingCodeFromMerchantPaymentId, verifyReturn, type ReturnParams } from "../../../../../lib/payment/ziraatpay";

export const dynamic = "force-dynamic";

/**
 * ZiraatPay RETURNURL callback'i (HPP 3D dönüşü — Direct POST, form-urlencoded).
 * AKIŞ: imzayı DOĞRULA → siparişi bul → (idempotent) ödendi işaretle → sonuç sayfasına yönlendir.
 * İmza tutmazsa hiçbir şey güncellenmez.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const params: ReturnParams = {
    merchantPaymentId: str(form.get("merchantPaymentId")),
    customerId: str(form.get("customerId")),
    sessionToken: str(form.get("sessionToken")),
    responseCode: str(form.get("responseCode")),
    random: str(form.get("random")),
    sdSha512: str(form.get("sdSha512"))
  };

  // Gerçekte kullanılan taksit ve tutar — HPP akışında müşteri taksidi değiştirebiliyor.
  // Kaydediyoruz ki komisyon farkı sessiz kalmasın; admin sipariş notunda görebilsin.
  const actualInstallment =
    str(form.get("installmentCount")) || str(form.get("INSTALLMENTCOUNT")) || str(form.get("installment"));
  const actualAmount = str(form.get("amount")) || str(form.get("AMOUNT"));

  const result = verifyReturn(params);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  // MERCHANTPAYMENTID "{takipKodu}-{deneme}" biçimindedir; siparişi takip kodundan bul.
  // İmza doğrulaması ise ZiraatPay'in gönderdiği TAM değerle yapılır (yukarıda).
  const trackingCode = trackingCodeFromMerchantPaymentId(params.merchantPaymentId);

  // İmza geçersiz: sahte POST olabilir — dokunma, güvenli tarafa yönlendir.
  if (!result.verified) {
    return redirectTo(`${siteUrl}/orders/${encodeURIComponent(trackingCode)}?payment=invalid`);
  }

  const order = await getOrderByTrackingCode(trackingCode);
  if (!order) {
    return redirectTo(`${siteUrl}/orders?payment=notfound`);
  }

  if (!result.approved) {
    return redirectTo(`${siteUrl}/orders/${encodeURIComponent(trackingCode)}?payment=failed`);
  }

  // Idempotent: zaten ödendiyse tekrar güncelleme, direkt başarıya yönlendir.
  const alreadyPaid = order.paymentStatus?.toLowerCase().includes("ödendi");
  if (!alreadyPaid && order.status !== "PAYMENT_PENDING") {
    return redirectTo(`${siteUrl}/orders/${encodeURIComponent(trackingCode)}?payment=invalid`);
  }
  if (!alreadyPaid) {
    await updateOrderOperation(
      {
        orderId: order.id,
        paymentStatus: "Kartla ödendi (ZiraatPay)",
        // İŞ KURALI (teyit): kartla ödeme sonrası sipariş hangi adıma geçsin?
        status: order.status === "PAYMENT_PENDING" ? "APPROVAL_PENDING" : order.status,
        internalNote:
          `ZiraatPay 3D ödemesi onaylandı. İşlem ref: ${params.sessionToken}` +
          (actualInstallment ? ` · Taksit: ${actualInstallment}` : "") +
          (actualAmount ? ` · Tahsil edilen: ${actualAmount}` : "")
      },
      "ZiraatPay"
    );
  }

  return redirectTo(`${siteUrl}/orders/${encodeURIComponent(trackingCode)}?payment=success`);
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Tarayıcı POST ile geldiği için 303 ile GET'e çeviriyoruz. */
function redirectTo(url: string): Response {
  return NextResponse.redirect(url, { status: 303 });
}
