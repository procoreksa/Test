import { getMeterReadingReport } from "@/lib/actions/move-in-reports";
import { getLocale, getDictionary, shortDateFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MeterReadingReportPage() {
  const [rows, locale] = await Promise.all([getMeterReadingReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMeterReading}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.meterTypeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.meterNumberLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.meterReadingLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.meterUnitOfMeasureLabel}</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{m.moveIn.moveInNumber}</td>
                <td className="px-4 py-3 text-slate-500">{m.moveIn.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{t.meterType[m.meterType]}</td>
                <td className="px-4 py-3 text-slate-500">{m.meterNumber ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{String(m.reading)}</td>
                <td className="px-4 py-3 text-slate-500">{m.unitOfMeasure ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(m.readingDate)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.meterEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
