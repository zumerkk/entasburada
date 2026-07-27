import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "../app/account/actions";

/**
 * Favori ekle/çıkar butonu. Giriş yapılmamışsa login'e yönlendiren link gösterir.
 * Server component: form + server action (client JS gerektirmez).
 */
export function FavoriteButton({
  sku,
  name,
  isFavorite,
  isAuthenticated,
  redirectTo
}: {
  sku: string;
  name: string;
  isFavorite: boolean;
  isAuthenticated: boolean;
  redirectTo: string;
}) {
  if (!isAuthenticated) {
    return (
      <a className="btn btnGhost favoriteBtn" href={`/login?next=${encodeURIComponent(redirectTo)}`}>
        <Heart size={18} aria-hidden="true" />
        Favorilere ekle
      </a>
    );
  }

  return (
    <form action={toggleFavoriteAction}>
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="productName" value={name} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className={`btn btnGhost favoriteBtn ${isFavorite ? "favoriteBtnActive" : ""}`}>
        <Heart size={18} aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
        {isFavorite ? "Favorilerde" : "Favorilere ekle"}
      </button>
    </form>
  );
}
