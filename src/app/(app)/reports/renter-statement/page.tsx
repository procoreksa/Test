import { listRenterOptions, getRenterStatement } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";

export default async function RenterStatementReportPage({
  searchParams,
}: {
  searchParams: Promise<{ renterId?: string }>;
}) {
  const [{ renterId }, renters, locale] = await Promise.all([searchParams, listRenterOptions(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const data = renterId ? await getRenterStatement(renterId) : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.renterStatement.title}</h1>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-end gap-4 no-print">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterRenter}</label>
          <select name="renterId" defaultValue={renterId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="" disabled>
              {t.reports.selectPlaceholder}
            </option>
            {renters.map((r) => (
              <option key={r.id} value={r.id}>
                {pickLocalized(locale, r.fullNameAr, r.fullName)}
              </option>
            ))}
          </select>
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
          {t.reports.filterApply}
        </button>
      </form>

      {!data ? (
        <p className="text-slate-400 text-sm">{t.reports.renterStatement.noSelection}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-4">{pickLocalized(locale, data.renter.fullNameAr, data.renter.fullName)}</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colDate}</th>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colType}</th>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colReference}</th>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colDebit}</th>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colCredit}</th>
                <th className="py-2 text-right font-medium">{t.reports.renterStatement.colBalance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ledger.map((entry, idx) => (
                <tr key={idx}>
                  <td className="py-2 text-slate-500">{dateFmt.format(entry.date)}</td>
                  <td className="py-2">
                    {entry.type === "INVOICE"
                      ? t.reports.renterStatement.invoiceEntry
                      : entry.type === "PAYMENT"
                        ? t.reports.renterStatement.paymentEntry
                        : t.reports.renterStatement.dueEntry}
                  </td>
                  <td className="py-2 text-slate-500">{entry.reference}</td>
                  <td className="py-2">{entry.debit > 0 ? sar.format(entry.debit) : "—"}</td>
                  <td className="py-2 text-emerald-600">{entry.credit > 0 ? sar.format(entry.credit) : "—"}</td>
                  <td className="py-2 font-medium">{sar.format(entry.balance)}</td>
                </tr>
              ))}
              {data.ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {t.reports.renterStatement.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data.ledger.length > 0 && (
            <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
              <div className="flex justify-between w-64 font-bold">
                <span>{t.reports.renterStatement.balanceDue}</span>
                <span>{sar.format(data.ledger[data.ledger.length - 1].balance)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
