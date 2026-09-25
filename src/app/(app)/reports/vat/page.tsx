import { getVatReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, numberFormatter } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";
import { defaultMonthRange } from "@/lib/report-dates";

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const defaults = defaultMonthRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;

  const [{ rows, totals }, locale] = await Promise.all([
    getVatReport(new Date(from), new Date(`${to}T23:59:59`)),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const count = numberFormatter(locale);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.vatReport.title}</h1>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-end gap-4 no-print">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterFrom}</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterTo}</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
          {t.reports.filterApply}
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.vatReport.colPeriod}</th>
              <th className="px-5 py-3 font-medium">{t.reports.vatReport.colInvoiceCount}</th>
              <th className="px-5 py-3 font-medium">{t.reports.vatReport.colSubtotal}</th>
              <th className="px-5 py-3 font-medium">{t.reports.vatReport.colVat}</th>
              <th className="px-5 py-3 font-medium">{t.reports.vatReport.colTotal}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.period}>
                <td className="px-5 py-3 font-medium text-slate-800">{row.period}</td>
                <td className="px-5 py-3 text-slate-500">{count.format(row.invoiceCount)}</td>
                <td className="px-5 py-3">{sar.format(row.subtotal)}</td>
                <td className="px-5 py-3 text-brand-gold-dark font-medium">{sar.format(row.vatAmount)}</td>
                <td className="px-5 py-3 font-medium">{sar.format(row.totalAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.vatReport.empty}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td className="px-5 py-3 font-bold text-slate-800">{t.reports.grandTotal}</td>
                <td className="px-5 py-3 font-bold text-slate-800">{count.format(totals.invoiceCount)}</td>
                <td className="px-5 py-3 font-bold">{sar.format(totals.subtotal)}</td>
                <td className="px-5 py-3 font-bold text-brand-gold-dark">{sar.format(totals.vatAmount)}</td>
                <td className="px-5 py-3 font-bold">{sar.format(totals.totalAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
