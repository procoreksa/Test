import { getMoveOutMeterReadingReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, shortDateFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MoveOutMeterReadingReportPage() {
  const [rows, locale] = await Promise.all([getMoveOutMeterReadingReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMoveOutMeterReading}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.meterTypeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.meterMoveInReadingLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.meterMoveOutReadingLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.meterDifferenceLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.fieldVacateDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{r.moveOut.moveOutNumber}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveOut.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500">{t.meterType[r.meterType]}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveInReading ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{String(r.reading)}</td>
                <td className="px-4 py-3 text-slate-500">{r.difference ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.readingDate ? dateFmt.format(r.readingDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.meterEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
