import { getCrmFunnelReport } from "@/lib/actions/reservation-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function CrmFunnelReportPage() {
  const [stages, locale] = await Promise.all([getCrmFunnelReport(), getLocale()]);
  const t = getDictionary(locale);

  const stageLabel: Record<(typeof stages)[number]["stage"], string> = {
    lead: t.reservationContract.funnelStageLead,
    viewing: t.reservationContract.funnelStageViewing,
    offer: t.reservationContract.funnelStageOffer,
    reservation: t.reservationContract.funnelStageReservation,
    contract: t.reservationContract.funnelStageContract,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.reservationContract.funnelReportTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.reservationContract.funnelReportSubtitle}</p>
        </div>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium"></th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.funnelColCount}</th>
              <th className="px-5 py-3 font-medium">{t.reservationContract.funnelColConversion}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stages.map((s) => (
              <tr key={s.stage}>
                <td className="px-5 py-3 text-slate-800 font-medium">{stageLabel[s.stage]}</td>
                <td className="px-5 py-3 text-slate-700">{s.count}</td>
                <td className="px-5 py-3 text-slate-500">{s.conversionFromPrevious === null ? "—" : `${s.conversionFromPrevious}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
