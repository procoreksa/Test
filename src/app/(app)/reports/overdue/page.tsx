import { getOverdueReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";

export default async function OverdueReportPage() {
  const [schedules, locale] = await Promise.all([getOverdueReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const total = schedules.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.overdue.title}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.overdue.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.reports.overdue.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reports.overdue.colDueDate}</th>
              <th className="px-5 py-3 font-medium">{t.reports.overdue.colDaysOverdue}</th>
              <th className="px-5 py-3 font-medium">{t.reports.overdue.colAmount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium text-slate-800">
                  {pickLocalized(locale, s.contract.renter.fullNameAr, s.contract.renter.fullName)}
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {pickLocalized(locale, s.contract.unit.property.nameAr, s.contract.unit.property.name)} / {s.contract.unit.unitNumber}
                </td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(s.dueDate)}</td>
                <td className="px-5 py-3 text-red-600 font-medium">{s.daysOverdue}</td>
                <td className="px-5 py-3 font-medium">{sar.format(Number(s.amount))}</td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.overdue.empty}
                </td>
              </tr>
            )}
          </tbody>
          {schedules.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={4} className="px-5 py-3 font-bold text-slate-800 text-right">
                  {t.reports.overdue.totalLabel}
                </td>
                <td className="px-5 py-3 font-bold text-red-600">{sar.format(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
