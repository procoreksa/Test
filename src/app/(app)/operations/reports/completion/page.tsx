import { getMoveInCompletionReport } from "@/lib/actions/move-in-reports";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MoveInCompletionReportPage() {
  const [rows, locale] = await Promise.all([getMoveInCompletionReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportCompletion}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.fieldStartedAt}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.fieldCompletedAt}</th>
              <th className="px-4 py-3 font-medium">{t.operations.reportCompletion} (days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{m.moveInNumber}</td>
                <td className="px-4 py-3 text-slate-500">{m.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, m.renter.fullNameAr, m.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.moveInStatus[m.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.startedAt ? dateFmt.format(m.startedAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.completedAt ? dateFmt.format(m.completedAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{m.durationDays ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
