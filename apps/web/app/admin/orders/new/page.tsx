import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "../../../../lib/admin-auth";
import type { AdminOrderCustomerOption } from "../../../../lib/admin-order-types";
import { getCustomers, type CustomerAccount } from "../../../../lib/customer-auth";
import { segmentLabel } from "../../../../lib/customer-pricing";
import { AdminFrame } from "../../AdminFrame";
import { AdminOrderBuilder } from "./AdminOrderBuilder";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function AdminNewOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const initialCustomerId = typeof params.customerId === "string" ? params.customerId : undefined;
  const customers = (await getCustomers())
    .filter((customer) => customer.status === "approved")
    .sort((left, right) => left.companyName.localeCompare(right.companyName, "tr"))
    .map(toCustomerOption);

  return (
    <AdminFrame active="orders">
      <header className="adminTopbar">
        <div>
          <span>Siparişler</span>
          <h1>Yeni sipariş oluştur</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href="/admin/orders">
            <ArrowLeft size={17} aria-hidden="true" />
            Siparişlere dön
          </a>
        </div>
      </header>
      <p className="adminPageLead">
        Bayiyi seçin, ürünleri ekleyin ve siparişi oluşturun. Sipariş açılınca müşteriye WhatsApp ile gönderebileceğiniz
        sipariş/ödeme linki hazır olur. Kayıtlı olmayan müşteriler veya fiyatı olmayan ürünler için{" "}
        <a href="/quote">teklif formunu</a> kullanın.
      </p>
      <AdminOrderBuilder customers={customers} {...(initialCustomerId ? { initialCustomerId } : {})} />
    </AdminFrame>
  );
}

function toCustomerOption(customer: CustomerAccount): AdminOrderCustomerOption {
  return {
    id: customer.id,
    companyName: customer.companyName,
    authorizedPerson: customer.authorizedPerson,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    deliveryAddress: customer.deliveryAddress,
    channelLabel: channelLabel(customer)
  };
}

function channelLabel(customer: CustomerAccount): string {
  const access = customer.sellerAccess;
  if (access?.enabled && access.mode !== "referral") {
    return access.mode === "dropshipping" ? "Dropshipping (kanal fiyatı)" : access.mode === "hybrid" ? "Al-sat + dropshipping (kanal fiyatı)" : "Al-sat bayi (kanal fiyatı)";
  }
  return customer.tierName ?? segmentLabel(customer.segment);
}
