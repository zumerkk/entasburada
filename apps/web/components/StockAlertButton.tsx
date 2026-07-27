import { BellRing, BellOff } from "lucide-react";
import { subscribeStockAction, unsubscribeStockAction } from "../app/account/actions";

/**
 * "Stok gelince haber ver" butonu. Yalnızca stokta olmayan ürünlerde gösterilir.
 * Giriş yoksa login'e yönlendirir; abone ise iptal seçeneği sunar.
 */
export function StockAlertButton({
  sku,
  name,
  slug,
  isSubscribed,
  isAuthenticated
}: {
  sku: string;
  name: string;
  slug: string;
  isSubscribed: boolean;
  isAuthenticated: boolean;
}) {
  const redirectTo = `/products/${slug}`;

  if (!isAuthenticated) {
    return (
      <a className="btn btnGhost stockAlertBtn" href={`/login?next=${encodeURIComponent(redirectTo)}`}>
        <BellRing size={18} aria-hidden="true" />
        Stok gelince haber ver
      </a>
    );
  }

  if (isSubscribed) {
    return (
      <form action={unsubscribeStockAction}>
        <input type="hidden" name="sku" value={sku} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button type="submit" className="btn btnGhost stockAlertBtn stockAlertActive">
          <BellOff size={18} aria-hidden="true" />
          Stok bildirimini iptal et
        </button>
      </form>
    );
  }

  return (
    <form action={subscribeStockAction}>
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="productName" value={name} />
      <input type="hidden" name="productSlug" value={slug} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className="btn btnGhost stockAlertBtn">
        <BellRing size={18} aria-hidden="true" />
        Stok gelince haber ver
      </button>
    </form>
  );
}
