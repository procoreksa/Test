import { getOwnerPortfolio } from "@/lib/actions/owner-reports";
import { listOwners } from "@/lib/actions/owners";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";

export default async function OwnerPortfolioReportPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string }>;
}) {
  const { ownerId } = await searchParams;
  const [rows, owners, locale] = await Promise.all([getOwnerPortfolio(ownerId || undefined), listOwners(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.ownerPortfolio.title}</h1>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-end gap-4 no-print">
        <div className="flex-1 max-w-sm">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.ownerPortfolio.fieldOwner}</label>
          <select name="ownerId" defaultValue={ownerId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.common.none}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {pickLocalized(locale, o.nameAr, o.name)}
              </option>
            ))}
          </select>
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
          {t.reports.filterApply}
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colOwner}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colBuilding}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colOwnershipPercent}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colAnnualRent}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colOccupancy}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colCurrentTenant}</th>
              <th className="px-5 py-3 font-medium">{t.reports.ownerPortfolio.colLeaseEnd}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-5 py-3 font-medium text-slate-800">{pickLocalized(locale, row.ownerNameAr, row.ownerName)}</td>
                <td className="px-5 py-3 text-slate-500">{pickLocalized(locale, row.compoundArabicName, row.compoundName)}</td>
                <td className="px-5 py-3 text-slate-500">{pickLocalized(locale, row.buildingNameAr, row.buildingName)}</td>
                <td className="px-5 py-3 text-slate-500">{row.unitNumber}</td>
                <td className="px-5 py-3">{Number(row.ownershipPercentage).toFixed(2)}%</td>
                <td className="px-5 py-3">{row.annualRent !== null ? sar.format(row.annualRent) : "—"}</td>
                <td className="px-5 py-3">{t.unitStatus[row.occupancyStatus as keyof typeof t.unitStatus]}</td>
                <td className="px-5 py-3 text-slate-500">
                  {row.currentTenant ? pickLocalized(locale, row.currentTenantAr, row.currentTenant) : t.common.none}
                </td>
                <td className="px-5 py-3 text-slate-500">{row.leaseEndDate ? dateFmt.format(row.leaseEndDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.ownerPortfolio.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
