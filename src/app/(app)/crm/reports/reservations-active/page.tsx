import { getActiveReservationsReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary, shortDateFormatter, currencyFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ActiveReservationsReportPage() {
  const [rows, locale] = await Promise.all([getActiveReservationsReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.reservation.reportActive}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reservation.colReservationNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colLead}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colStatus}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colAmount}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colHoldUntil}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colAgent}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-slate-800 font-medium">{r.reservationNumber}</td>
                <td className="px-5 py-3 text-slate-700">{r.lead.fullName}</td>
                <td className="px-5 py-3 text-slate-500">{r.unit.unitNumber}</td>
                <td className="px-5 py-3 text-slate-500">{t.reservationStatus[r.status]}</td>
                <td className="px-5 py-3 text-slate-500">{sar.format(Number(r.reservationAmount))}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(r.holdUntil)}</td>
                <td className="px-5 py-3 text-slate-500">{r.assignedToUser?.name ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
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
