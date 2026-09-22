import { getReservationExpiryReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary, longDateTimeFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ReservationExpiryReportPage() {
  const [rows, locale] = await Promise.all([getReservationExpiryReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.reservation.reportExpiry}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reservation.colReservationNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colLead}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colStatus}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colHoldUntil}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.isPastDue ? "bg-red-50" : ""}>
                <td className="px-5 py-3 text-slate-800 font-medium">{r.reservationNumber}</td>
                <td className="px-5 py-3 text-slate-700">{r.lead.fullName}</td>
                <td className="px-5 py-3 text-slate-500">{r.unit.unitNumber}</td>
                <td className="px-5 py-3 text-slate-500">{t.reservationStatus[r.status]}</td>
                <td className={`px-5 py-3 ${r.isPastDue ? "text-red-600 font-semibold" : "text-slate-500"}`}>{dateTimeFmt.format(r.holdUntil)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
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
