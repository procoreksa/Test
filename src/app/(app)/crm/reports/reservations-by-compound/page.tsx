import { getReservationsByCompoundReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary, currencyFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ReservationsByCompoundReportPage() {
  const [rows, locale] = await Promise.all([getReservationsByCompoundReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.reservation.reportByCompound}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reservation.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colCount}</th>
              <th className="px-5 py-3 font-medium">{t.reservationStatus.CONFIRMED}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colTotalAmount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.compoundId}>
                <td className="px-5 py-3 text-slate-800 font-medium">{pickLocalized(locale, r.nameAr, r.name)}</td>
                <td className="px-5 py-3 text-slate-700">{r.reservationCount}</td>
                <td className="px-5 py-3 text-slate-700">{r.confirmedCount}</td>
                <td className="px-5 py-3 text-slate-800 font-semibold">{sar.format(r.totalAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
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
