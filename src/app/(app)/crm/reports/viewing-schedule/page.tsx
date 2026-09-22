import { getViewingScheduleReport } from "@/lib/actions/viewing-reports";
import { getLocale, getDictionary, shortDateFormatter, shortTimeFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ViewingScheduleReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const timeFmt = shortTimeFormatter(locale);

  const from = params.from ? new Date(params.from) : undefined;
  const to = params.to ? new Date(`${params.to}T23:59:59`) : undefined;
  const viewings = await getViewingScheduleReport(from, to);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.viewing.reportSchedule}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterDateFrom}</label>
          <input type="date" name="from" defaultValue={params.from} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterDateTo}</label>
          <input type="date" name="to" defaultValue={params.to} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="self-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.viewing.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.viewing.colViewingNumber}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colLead}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colUnits}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colTime}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colAgent}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {viewings.map((v) => {
              const compound = v.units[0]?.unit.floor.building.compound;
              return (
                <tr key={v.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{v.viewingNumber}</td>
                  <td className="px-5 py-3 text-slate-700">{v.lead.fullName}</td>
                  <td className="px-5 py-3 text-slate-500">{compound ? pickLocalized(locale, compound.arabicName, compound.name) : "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{v.units.map((u) => u.unit.unitNumber).join(", ")}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(v.scheduledStart)}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{timeFmt.format(v.scheduledStart)}</td>
                  <td className="px-5 py-3 text-slate-500">{v.assignedToUser?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{t.viewingStatus[v.status]}</td>
                </tr>
              );
            })}
            {viewings.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  {t.viewing.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
