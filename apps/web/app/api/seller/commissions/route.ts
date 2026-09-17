import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { sellerDashboard } from "../../../../lib/seller-dashboard";
import { commissionSummary } from "../../../../lib/seller-commission";
export async function GET() {
  const seller = await getCurrentCustomer();
  if (
    !seller?.sellerAccess?.enabled ||
    (seller.companyId ?? seller.id) !== seller.id
  )
    return new Response("Yetkisiz erişim", { status: 403 });
  const data = await sellerDashboard(seller.id);
  const rows = [
    [
      "Sipariş",
      "Müşteri",
      "Tarih",
      "Para birimi",
      "Ürün",
      "Adet",
      "İade",
      "Satış",
      "Komisyon",
      "Ödenen toplam",
      "Ödenebilir toplam",
    ],
  ];
  for (const order of data.orders) {
    const c = order.sellerCommission!;
    const summary = commissionSummary(c, order.status, order.paymentStatus);
    c.lines.forEach((line, index) =>
      rows.push([
        order.orderNo,
        order.companyName,
        order.orderedAt,
        order.currency,
        line.productName,
        String(line.quantity),
        String(line.refundedQuantity),
        (line.saleCents / 100).toFixed(2),
        (summary.cancelled
          ? 0
          : Math.round(
              (line.saleCents * (line.quantity - line.refundedQuantity)) /
                line.quantity /
                10,
            ) / 100
        ).toFixed(2),
        index === 0 ? (c.paidCents / 100).toFixed(2) : "",
        index === 0 ? (summary.payableCents / 100).toFixed(2) : "",
      ]),
    );
  }
  const csv = rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${(/^[=+@\-\t\r\n]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`,
        )
        .join(";"),
    )
    .join("\r\n");
  return new Response("\ufeff" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="satici-komisyonlar.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
