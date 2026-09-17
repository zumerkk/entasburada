import DealerApplicationPage from "../../dealer-application/page";
import { requireReferralSeller } from "../../../lib/seller-dashboard";
export default async function SellerCustomerPage() {
  await requireReferralSeller();
  return (
    <>
      <div className="shell referralBack">
        <a href="/satici">← Yetkili paneline dön</a>
        <h2>Yeni müşteri kaydı</h2>
        <p>
          Bu başvuru sizin satıcı hesabınıza bağlanır. Müşterinin bilgilerini ve
          onayını alarak formu doldurun.
        </p>
      </div>
      <DealerApplicationPage searchParams={Promise.resolve({ seller: "1" })} />
    </>
  );
}
