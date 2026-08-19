import { getCurrentCustomer } from "../../../../../../lib/customer-auth";
import { getCustomerBalance } from "../../../../../../lib/customer-balance-repository";
import {
  activateBalancePaymentIntent,
  BalancePaymentAvailabilityError,
  createBalancePaymentIntent,
  failBalancePaymentIntent
} from "../../../../../../lib/customer-balance-payment-repository";
import {
  BALANCE_PAYMENT_SESSION_EXPIRY_HOURS,
  balancePaymentError,
  parseBalancePaymentAmount
} from "../../../../../../lib/customer-balance-payment-policy";
import { buildMerchantPaymentId, createPaymentSession, isDirectPostEnabled } from "../../../../../../lib/payment/ziraatpay";
import { consumeRateLimit } from "../../../../../../lib/rate-limit";
import { getClientAddress, noStoreJson, readJsonBody, requestErrorResponse, trustedMutationError } from "../../../../../../lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const originError = trustedMutationError(request);
  if (originError) return originError;

  const customer = await getCurrentCustomer();
  if (!customer) return noStoreJson({ error: "Müşteri girişi gerekli." }, 401);

  const rateLimit = await consumeRateLimit("balance-payment-start", customer.id, {
    limit: 6,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return noStoreJson({ error: "Çok fazla ödeme denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." }, 429);
  }

  let amount: number | null = null;
  try {
    const body = await readJsonBody<{ amount?: unknown }>(request, 4 * 1024);
    amount = parseBalancePaymentAmount(body.amount);
  } catch (error) {
    return requestErrorResponse(error, "Geçersiz ödeme isteği.");
  }

  const balance = await getCustomerBalance(customer);
  const validationError = balancePaymentError(amount, balance.balance);
  if (validationError || amount === null) {
    return noStoreJson({ error: validationError ?? "Geçersiz ödeme tutarı." }, 400);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) {
    return noStoreJson({ error: "Ödeme adresi yapılandırılmamış." }, 500);
  }

  let intent;
  try {
    intent = await createBalancePaymentIntent(customer, amount, balance.balance);
  } catch (error) {
    if (error instanceof BalancePaymentAvailabilityError) {
      return noStoreJson({ error: error.message }, 409);
    }
    return noStoreJson({ error: "Ödeme kaydı oluşturulamadı. Lütfen yeniden deneyin." }, 500);
  }
  const merchantPaymentId = buildMerchantPaymentId(intent.id);
  const expiresAt = new Date(Date.now() + BALANCE_PAYMENT_SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const session = await createPaymentSession({
      merchantPaymentId,
      amount: amount.toFixed(2),
      installments: 1,
      sessionExpiry: `${BALANCE_PAYMENT_SESSION_EXPIRY_HOURS}h`,
      currency: "TRY",
      returnUrl: `${siteUrl}/api/payments/ziraatpay/balance/callback`,
      customerId: intent.providerCustomerId,
      customerName: customer.companyName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerIp: getClientAddress(request.headers),
      orderItems: [
        {
          productCode: "CARI-ODEME",
          name: "Cari hesap borç ödemesi",
          quantity: 1,
          amount
        }
      ]
    });

    await activateBalancePaymentIntent(intent.id, {
      merchantPaymentId,
      sessionToken: session.sessionToken,
      paymentPageUrl: session.redirectUrl,
      expiresAt
    });

    return noStoreJson({
      reference: intent.id,
      amount: amount.toFixed(2),
      ...(isDirectPostEnabled() ? { directPostUrl: session.directPostUrl } : {}),
      redirectUrl: session.redirectUrl
    });
  } catch (error) {
    await failBalancePaymentIntent(intent.id, error instanceof Error ? error.message : "Ödeme oturumu açılamadı.");
    const message = process.env.NODE_ENV === "production"
      ? "Ödeme başlatılamadı. Lütfen daha sonra yeniden deneyin."
      : error instanceof Error ? error.message : "Ödeme başlatılamadı.";
    return noStoreJson({ error: message }, 502);
  }
}
