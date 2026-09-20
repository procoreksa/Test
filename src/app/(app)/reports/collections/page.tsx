import { getCollectionsReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";
import { defaultMonthRange } from "@/lib/report-dates";

export default async function CollectionsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  const defaults = defaultMonthRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const q = params.q;

  const [{ payments: allPayments, total: allTotal }, locale] = await Promise.all([
    getCollectionsReport(new Date(from), new Date(`${to}T23:59:59`)),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const query = (q ?? "").trim().toLowerCase();
  const payments = query
    ? allPayments.filter((p) => {
        const unitNumber = p.invoice.contract?.unit?.unitNumber ?? "";
        return (
          p.renter.fullName.toLowerCase().includes(query) ||
          (p.renter.fullNameAr ?? "").toLowerCase().includes(query) ||
          unitNumber.toLowerCase().includes(query)
        );
      })
    : allPayments;
  const total = query ? payments.reduce((sum, p) => sum + Number(p.amount), 0) : allTotal;

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.collectionsReport.title}</h1>
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

      <form method="get" className="max-w-sm no-print">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.reports.searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.collectionsReport.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.reports.collectionsReport.colReceiptNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reports.collectionsReport.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.reports.collectionsReport.colMethod}</th>
              <th className="px-5 py-3 font-medium">{t.reports.collectionsReport.colAmount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(p.paymentDate)}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{p.receiptNumber}</td>
                <td className="px-5 py-3">{pickLocalized(locale, p.renter.fullNameAr, p.renter.fullName)}</td>
                <td className="px-5 py-3 text-slate-500">{t.paymentMethod[p.method]}</td>
                <td className="px-5 py-3 font-medium text-emerald-600">{sar.format(Number(p.amount))}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.collectionsReport.empty}
                </td>
              </tr>
            )}
          </tbody>
          {payments.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={4} className="px-5 py-3 font-bold text-slate-800 text-right">
                  {t.reports.collectionsReport.totalLabel}
                </td>
                <td className="px-5 py-3 font-bold text-emerald-600">{sar.format(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
