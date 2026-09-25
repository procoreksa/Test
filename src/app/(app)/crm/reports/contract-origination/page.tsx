import Link from "next/link";
import { getContractOriginationReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ContractOriginationReportPage() {
  const [rows, locale] = await Promise.all([getContractOriginationReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.reservationContract.originationReportTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.reservationContract.originationReportSubtitle}</p>
        </div>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.contracts.colContractNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colLead}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.colViewingNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colOfferNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colReservationNumber}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reservation.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.colAnnualRent}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.colStartDate}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.colEndDate}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.colSource}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-slate-800 font-medium">
                  <Link href={`/contracts/${r.id}/edit`} className="text-brand-gold-dark hover:underline">
                    {r.contractNumber}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {r.leadId ? (
                    <Link href={`/crm/leads/${r.leadId}`} className="hover:underline">
                      {r.leadName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3 text-slate-500">{r.viewingNumber ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{r.offerNumber ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{r.reservationNumber ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{r.renterName}</td>
                <td className="px-5 py-3 text-slate-500">{r.unitNumber}</td>
                <td className="px-5 py-3 text-slate-500">{r.compoundName}</td>
                <td className="px-5 py-3 text-slate-500">{sar.format(r.rentAmount)}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(r.startDate)}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(r.endDate)}</td>
                <td className="px-5 py-3 text-slate-500">
                  {r.source === "RESERVATION" ? t.reservationContract.sourceReservation : t.reservationContract.sourceManual}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-5 py-8 text-center text-slate-400">
                  {t.contracts.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
