import { getMoveOutScheduleReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";

export default async function MoveOutScheduleReportPage() {
  const [rows, locale] = await Promise.all([getMoveOutScheduleReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMoveOutSchedule}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colScheduled}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.fieldInspector}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{m.moveOutNumber}</td>
                <td className="px-4 py-3 text-slate-500">{m.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500">{unitLocationLabel(locale, m.unit)}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, m.renter.fullNameAr, m.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.moveOutStatus[m.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.scheduledAt ? dateFmt.format(m.scheduledAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{m.inspectedByUser?.name ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
