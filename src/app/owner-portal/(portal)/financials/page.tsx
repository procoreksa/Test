import { getOwnerPortalFinancialSummary } from "@/lib/actions/owner-portal/financials";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function OwnerPortalFinancialsPage() {
  const [summary, locale] = await Promise.all([getOwnerPortalFinancialSummary(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.financialsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.financialsSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardCurrentBalance}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{moneyFmt.format(Number(summary.currentBalance))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardMonthToDateIncome}</p>
          <p className="text-lg font-bold mt-2 text-emerald-700">{moneyFmt.format(Number(summary.monthToDateIncome))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardMonthToDateExpenses}</p>
          <p className="text-lg font-bold mt-2 text-red-700">{moneyFmt.format(Number(summary.monthToDateExpenses))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardYearToDateIncome}</p>
          <p className="text-lg font-bold mt-2 text-emerald-700">{moneyFmt.format(Number(summary.yearToDateIncome))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardYearToDateExpenses}</p>
          <p className="text-lg font-bold mt-2 text-red-700">{moneyFmt.format(Number(summary.yearToDateExpenses))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardNetMovement}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{moneyFmt.format(Number(summary.netMovement))}</p>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <h2 className="font-semibold text-slate-800 px-5 pt-4">{t.ownerPortal.recentLedgerEntriesTitle}</h2>
        <table className="w-full text-sm mt-2">
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
            {summary.recentEntries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(e.entryDate)}</td>
                <td className="px-4 py-3 text-slate-500">{t.ownerLedgerEntryType[e.entryType as keyof typeof t.ownerLedgerEntryType]}</td>
                <td className="px-4 py-3 text-slate-700">{e.description}</td>
                <td className="px-4 py-3 text-slate-500">{e.propertyLabel ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(e.debit) > 0 ? moneyFmt.format(Number(e.debit)) : "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(e.credit) > 0 ? moneyFmt.format(Number(e.credit)) : "-"}</td>
              </tr>
            ))}
            {summary.recentEntries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyLedger}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
