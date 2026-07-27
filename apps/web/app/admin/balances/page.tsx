import { TrendingDown, TrendingUp } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getCustomers } from "../../../lib/customer-auth";
import { getCustomerBalance, getLedgerEntries } from "../../../lib/customer-balance-repository";
import { formatMoney, parseMoney } from "../../../lib/customer-pricing";
import type { BalanceSummary } from "../../../lib/customer-balance-policy";
import { AdminFrame } from "../AdminFrame";
import { addLedgerEntryAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminBalancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const selectedId = getParam(params, "customer");
  const ok = getParam(params, "ok");
  const error = getParam(params, "error");

  const customers = await getCustomers();
  const balances = await Promise.all(
    customers.map(async (customer) => ({ customer, balance: await getCustomerBalance(customer) }))
  );

  const selected = customers.find((customer) => customer.id === selectedId) ?? customers[0] ?? null;
  const selectedLedger = selected ? await getLedgerEntries(selected.id) : [];
  const selectedBalance = selected ? balances.find((row) => row.customer.id === selected.id)?.balance ?? null : null;

  const totalDebt = balances.reduce((sum, row) => sum + Math.max(0, row.balance.balance), 0);
  const overLimitCount = balances.filter((row) => row.balance.overLimit).length;

  return (
    <AdminFrame active="balances">
      <header className="adminTopbar">
        <div>
          <span>Finans</span>
          <h1>Cari hesaplar</h1>
        </div>
        <div className="balanceHeaderStats">
          <div>
            <span>Toplam açık borç</span>
            <strong>{formatMoney(totalDebt, "TRY")}</strong>
          </div>
          <div>
            <span>Limit aşan bayi</span>
            <strong>{overLimitCount.toLocaleString("tr-TR")}</strong>
          </div>
        </div>
      </header>

      {ok ? <p className="formSuccess">{ok}</p> : null}
      {error ? <p className="formError" role="alert">{error}</p> : null}

      <div className="balanceAdminGrid">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Bayiler</h2>
              <p>Bir bayi seçerek cari hareket ekleyin.</p>
            </div>
          </div>
          <div className="balanceTable">
            {balances.map(({ customer, balance }) => (
              <a
                className={`balanceTableRow ${selected?.id === customer.id ? "active" : ""}`}
                href={`/admin/balances?customer=${encodeURIComponent(customer.id)}`}
                key={customer.id}
              >
                <span className="balanceTableName">
                  <strong>{customer.companyName}</strong>
                  <small>{customer.email}</small>
                </span>
                <span className="balanceTableFig">
                  <strong className={balance.balance > 0 ? "isDebt" : "isClear"}>{formatMoney(balance.balance, balance.currency)}</strong>
                  <small>Kalan {formatMoney(Math.max(0, balance.availableCredit), balance.currency)}</small>
                </span>
                {balance.overLimit ? <StatusPill tone="danger">Limit aşımı</StatusPill> : <StatusPill tone="success">Uygun</StatusPill>}
              </a>
            ))}
            {balances.length === 0 ? <p className="balanceEmpty">Kayıtlı bayi yok.</p> : null}
          </div>
        </section>

        {selected && selectedBalance ? (
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>{selected.companyName}</h2>
                <p>{selected.email} · {selected.city}</p>
              </div>
            </div>

            <BalanceStat balance={selectedBalance} />

            <form className="balanceForm" action={addLedgerEntryAction}>
              <input type="hidden" name="customerId" value={selected.id} />
              <div className="balanceFormRow">
                <label>
                  İşlem türü
                  <select name="type" required defaultValue="debit">
                    <option value="debit">Borç (satış / fatura)</option>
                    <option value="credit">Alacak (tahsilat / ödeme)</option>
                  </select>
                </label>
                <label>
                  Tutar (TRY)
                  <input name="amount" inputMode="decimal" placeholder="0,00" required />
                </label>
                <label>
                  Tarih
                  <input name="date" type="date" />
                </label>
              </div>
              <label>
                Açıklama
                <input name="description" placeholder="Örn. ETB-2026-0142 no'lu sipariş" required />
              </label>
              <button className="btn btnPrimary" type="submit">Hareket ekle</button>
            </form>

            <div className="balanceLedgerAdmin">
              <h3>Son hareketler</h3>
              {selectedLedger.slice(0, 20).map((item) => (
                <div className={`balanceRow ${item.type}`} key={item.id}>
                  <span className="balanceRowIcon" aria-hidden="true">
                    {item.type === "debit" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  </span>
                  <span className="balanceRowInfo">
                    <strong>{item.description}</strong>
                    <small>{formatDate(item.date)}{item.createdBy ? ` · ${item.createdBy}` : ""}</small>
                  </span>
                  <span className={`balanceRowAmount ${item.type}`}>
                    {item.type === "debit" ? "+" : "−"}
                    {formatMoney(parseMoney(item.amount), "TRY")}
                  </span>
                </div>
              ))}
              {selectedLedger.length === 0 ? <p className="balanceEmpty">Henüz cari hareket yok.</p> : null}
            </div>
          </section>
        ) : null}
      </div>
    </AdminFrame>
  );
}

function BalanceStat({ balance }: { balance: BalanceSummary }) {
  return (
    <div className="balanceMeta balanceMetaWide">
      <div>
        <span>Güncel bakiye</span>
        <strong className={balance.balance > 0 ? "isDebt" : ""}>{formatMoney(balance.balance, balance.currency)}</strong>
      </div>
      <div>
        <span>Kredi limiti</span>
        <strong>{formatMoney(balance.creditLimit, balance.currency)}</strong>
      </div>
      <div>
        <span>Kullanılabilir</span>
        <strong className={balance.overLimit ? "isDebt" : ""}>{formatMoney(balance.availableCredit, balance.currency)}</strong>
      </div>
      <div>
        <span>Toplam borç</span>
        <strong>{formatMoney(balance.totalDebit, balance.currency)}</strong>
      </div>
      <div>
        <span>Toplam alacak</span>
        <strong>{formatMoney(balance.totalCredit, balance.currency)}</strong>
      </div>
      <div>
        <span>Hareket</span>
        <strong>{balance.entryCount.toLocaleString("tr-TR")}</strong>
      </div>
    </div>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}
