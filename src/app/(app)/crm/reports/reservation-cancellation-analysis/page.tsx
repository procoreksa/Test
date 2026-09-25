import { getReservationCancellationAnalysisReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ReservationCancellationAnalysisReportPage() {
  const [rows, locale] = await Promise.all([getReservationCancellationAnalysisReport(), getLocale()]);
  const t = getDictionary(locale);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.reservation.reportCancellationAnalysis}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reservation.colReason}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colCount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.reason}>
                <td className="px-5 py-3 text-slate-700">{t.reservationCancelReason[r.reason]}</td>
                <td className="px-5 py-3 font-semibold text-slate-800">{r.count}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-semibold bg-slate-50">
                <td className="px-5 py-3">{t.crm.colTotal}</td>
                <td className="px-5 py-3">{total}</td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-slate-400">
                  {t.reservation.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
