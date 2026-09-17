import "server-only";
import { redirect } from "next/navigation";
import { getCustomers, requireCustomer } from "./customer-auth";
import { listDealerApplications } from "./dealer-application-repository";
import { loadCommercialRecordsForAnalytics } from "./commercial-repository";
import { commissionSummary } from "./seller-commission";

export async function requireReferralSeller() {
  const seller = await requireCustomer();
  if (
    !seller.sellerAccess?.enabled ||
    (seller.companyId ?? seller.id) !== seller.id
  )
    redirect("/account");
  return seller;
}

export async function sellerDashboard(sellerId: string) {
  const [customers, applications, records] = await Promise.all([
    getCustomers(),
    listDealerApplications(),
    loadCommercialRecordsForAnalytics(),
  ]);
  const orders = records.orders
    .filter((o) => o.sellerCommission?.referral.sellerId === sellerId)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
  const totals: Record<
    string,
    { pending: number; payable: number; paid: number; recovery: number }
  > = {};
  for (const order of orders) {
    const summary = commissionSummary(
      order.sellerCommission!,
      order.status,
      order.paymentStatus,
    );
    const currency = order.currency === "TL" ? "TRY" : order.currency;
    const total = (totals[currency] ??= {
      pending: 0,
      payable: 0,
      paid: 0,
      recovery: 0,
    });
    total.pending += summary.pendingCents;
    total.payable += summary.payableCents;
    total.paid += summary.paidCents;
    total.recovery += summary.recoveryCents;
  }
  return {
    customers: customers.filter((c) => c.referral?.sellerId === sellerId),
    applications: applications.filter((a) => a.referral?.sellerId === sellerId),
    orders,
    totals,
  };
}

export function commissionMoney(cents: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency === "TL" ? "TRY" : currency,
  }).format(cents / 100);
}
