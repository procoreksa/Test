import { getOwnerPortalLedger } from "@/lib/actions/owner-portal/financials";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

/** Owner Ledger (Step 28-30) - entitlement is `ownerId` match only, never property-based, so every row here is always exactly this owner's own, even on a shared Unit (see requireOwnerLedgerAccess() / getOwnerPortalLedger()). */
export default async function OwnerPortalLedgerPage() {
  const [{ rows, balance }, locale] = await Promise.all([getOwnerPortalLedger(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.ledgerTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.ledgerSubtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardCurrentBalance}</p>
          <p className="text-xl font-bold text-slate-900">{moneyFmt.format(Number(balance))}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDate}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colType}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDescription}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colProperty}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDebit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colCredit}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(e.entryDate)}</td>
                <td className="px-4 py-3 text-slate-500">{t.ownerLedgerEntryType[e.entryType as keyof typeof t.ownerLedgerEntryType]}</td>
                <td className="px-4 py-3 text-slate-700">{e.description}</td>
                <td className="px-4 py-3 text-slate-500">{e.propertyLabel ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(e.debit) > 0 ? moneyFmt.format(Number(e.debit)) : "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(e.credit) > 0 ? moneyFmt.format(Number(e.credit)) : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyLedger}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
