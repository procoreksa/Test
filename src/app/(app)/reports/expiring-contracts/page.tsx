import { getExpiringContractsReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";
import { defaultExpiringRange } from "@/lib/report-dates";

export default async function ExpiringContractsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  const defaults = defaultExpiringRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const q = params.q;

  const [allContracts, locale] = await Promise.all([
    getExpiringContractsReport(new Date(from), new Date(to)),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const query = (q ?? "").trim().toLowerCase();
  const contracts = query
    ? allContracts.filter(
        (c) =>
          c.renter.fullName.toLowerCase().includes(query) ||
          (c.renter.fullNameAr ?? "").toLowerCase().includes(query) ||
          c.unit.unitNumber.toLowerCase().includes(query)
      )
    : allContracts;

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.expiringContracts.title}</h1>
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
              <th className="px-5 py-3 font-medium">{t.reports.expiringContracts.colContractNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reports.expiringContracts.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.reports.expiringContracts.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reports.expiringContracts.colEndDate}</th>
              <th className="px-5 py-3 font-medium">{t.reports.expiringContracts.colDaysLeft}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{c.contractNumber}</td>
                <td className="px-5 py-3">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</td>
                <td className="px-5 py-3 text-slate-500">
                  {pickLocalized(locale, c.unit.property.nameAr, c.unit.property.name)} / {c.unit.unitNumber}
                </td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(c.endDate)}</td>
                <td className="px-5 py-3 font-medium text-amber-600">{c.daysLeft}</td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.expiringContracts.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
