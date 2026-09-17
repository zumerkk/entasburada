import type { SellerReferral } from "./customer-auth";

export interface SellerCommission {
  referral: SellerReferral;
  rate: 10;
  lines: {
    itemId: string;
    productName: string;
    quantity: number;
    saleCents: number;
    refundedQuantity: number;
  }[];
  paidCents: number;
  revision: number;
  payments: {
    at: string;
    actor: string;
    amountCents: number;
    reference: string;
  }[];
}

export function commissionSummary(
  commission: SellerCommission,
  status: string,
  paymentStatus: string,
) {
  const normalizedPayment = normalizePaymentStatus(paymentStatus);
  const cancelled =
    status === "CANCELLED" ||
    ["refunded", "iade edildi", "iade", "cancelled", "iptal"].includes(normalizedPayment);
  const earnedCents = cancelled
    ? 0
    : commission.lines.reduce(
        (sum, line) =>
          sum +
          Math.round(
            (line.saleCents * (line.quantity - line.refundedQuantity)) /
              line.quantity /
              10,
          ),
        0,
      );
  const paid = [
    "paid",
    "ödendi",
    "odendi",
    "tahsil edildi",
    "ödeme alındı",
    "kartla ödendi (ziraatpay)",
  ].map(normalizePaymentStatus).includes(normalizedPayment);
  const eligible =
    !cancelled && paid && ["DELIVERED", "COMPLETED"].includes(status);
  return {
    earnedCents,
    paidCents: commission.paidCents,
    pendingCents: eligible ? 0 : Math.max(0, earnedCents - commission.paidCents),
    payableCents: eligible
      ? Math.max(0, earnedCents - commission.paidCents)
      : 0,
    recoveryCents: Math.max(0, commission.paidCents - earnedCents),
    eligible,
    cancelled,
  };
}

export function settleCommission(
  commission: SellerCommission,
  status: string,
  paymentStatus: string,
  reference: string,
  actor: string,
  at: string,
): SellerCommission {
  const summary = commissionSummary(commission, status, paymentStatus);
  if (reference.trim().length < 3 || reference.length > 160)
    throw new Error("Banka/dekont referansı 3–160 karakter olmalıdır.");
  if (!summary.payableCents)
    throw new Error(
      "Ödenebilir komisyon yok. Tahsilat ve teslimat durumlarını kontrol edin.",
    );
  return {
    ...commission,
    paidCents: commission.paidCents + summary.payableCents,
    revision: commission.revision + 1,
    payments: [
      ...commission.payments,
      {
        at,
        actor,
        amountCents: summary.payableCents,
        reference: reference.trim(),
      },
    ],
  };
}

function normalizePaymentStatus(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/\s+/g, " ");
}
