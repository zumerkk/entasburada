import { orderStatusLabel } from "./commercial-labels";
import type { CommercialHistoryEntry } from "./commercial-repository";

/** Müşteriye gösterilen geçmişte admin/sistem kullanıcı adı yerine görünen ad. */
export const PUBLIC_ACTOR_NAME = "ENTAŞBURADA";

export interface CustomerHistoryLine {
  id: string;
  at: string;
  message: string;
  actorName: string;
}

/**
 * Takip linkiyle girişsiz açılabilen müşteri sipariş sayfasında gösterilecek geçmiş.
 *
 * Admin/sistem kayıtlarının serbest metni iç not, ödeme oturum referansı veya
 * komisyon bilgisi içerebilir (eski kayıtlarda iç not doğrudan mesaja yazılıyordu).
 * Bu yüzden yalnız müşterinin kendi işlemleri ve "public" işaretli kayıtlar aynen
 * gösterilir; diğer admin/sistem kayıtları durum değişikliğine indirgenir,
 * "internal" kayıtlar hiç gösterilmez.
 */
export function customerOrderHistory(history: CommercialHistoryEntry[]): CustomerHistoryLine[] {
  return history
    .filter((entry) => entry.visibility !== "internal")
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      message: entry.actor === "customer" || entry.visibility === "public" ? entry.message : neutralOrderMessage(entry),
      actorName: publicActorName(entry)
    }));
}

/** Müşteri kendi adını görür; admin e-postası veya sistem adı gösterilmez. */
export function publicActorName(entry: Pick<CommercialHistoryEntry, "actor" | "actorName">): string {
  return entry.actor === "customer" ? entry.actorName : PUBLIC_ACTOR_NAME;
}

function neutralOrderMessage(entry: Pick<CommercialHistoryEntry, "fromStatus" | "toStatus">): string {
  if (entry.toStatus && entry.toStatus !== entry.fromStatus) {
    return `Sipariş durumu güncellendi: ${orderStatusLabel(entry.toStatus).label}.`;
  }
  return "Sipariş bilgileri güncellendi.";
}
