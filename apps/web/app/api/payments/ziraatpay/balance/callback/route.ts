import { NextResponse } from "next/server";
import {
  completeBalancePaymentIntent,
  failBalancePaymentIntent,
  getBalancePaymentIntent
} from "../../../../../../lib/customer-balance-payment-repository";
import { balancePaymentProviderMatches } from "../../../../../../lib/customer-balance-payment-policy";
import { trackingCodeFromMerchantPaymentId, verifyReturn, type ReturnParams } from "../../../../../../lib/payment/ziraatpay";

export const dynamic = "force-dynamic";

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
  const reference = trackingCodeFromMerchantPaymentId(params.merchantPaymentId);
  const result = verifyReturn(params);

  if (!result.verified) {
    return redirectTo(resultUrl(request, "invalid", reference));
  }

  const intent = await getBalancePaymentIntent(reference);
  const providerMatches = Boolean(intent && balancePaymentProviderMatches(intent, params));
  if (!intent || !providerMatches) {
    return redirectTo(resultUrl(request, "invalid", reference));
  }

  if (!result.approved) {
    await failBalancePaymentIntent(intent.id, `ZiraatPay yanıt kodu: ${params.responseCode || "bilinmiyor"}`);
    return redirectTo(resultUrl(request, "failed", intent.id));
  }

  try {
    await completeBalancePaymentIntent(intent.id, {
      actualChargedAmount: str(form.get("amount")) || str(form.get("AMOUNT")),
      installmentCount:
        str(form.get("installmentCount")) || str(form.get("INSTALLMENTCOUNT")) || str(form.get("installment"))
    });
  } catch {
    return redirectTo(resultUrl(request, "invalid", intent.id));
  }

  return redirectTo(resultUrl(request, "success", intent.id));
}

function resultUrl(request: Request, payment: "success" | "failed" | "invalid", reference: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configured ? new URL(configured).origin : new URL(request.url).origin;
  const url = new URL("/account/debt-payment", origin);
  url.searchParams.set("payment", payment);
  if (reference) url.searchParams.set("reference", reference);
  return url.toString();
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function redirectTo(url: string): Response {
  return NextResponse.redirect(url, { status: 303 });
}
