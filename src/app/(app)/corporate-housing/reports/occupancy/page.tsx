import Link from "next/link";
import { getCorporateOccupancyReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function CorporateOccupancyReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getCorporateOccupancyReport(page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.corporateHousing.reportOccupancy}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colDisplayName}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateContractCount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateUnitCount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnitsWithAllocation}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnallocatedUnitCount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.cardActiveOccupants}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colAllocationRate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.account.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/corporate-housing/accounts/${r.account.id}`} className="hover:underline">
                    {r.account.displayName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{r.corporateContractCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.corporateUnitCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.unitsWithAllocationCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.unallocatedUnitCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.activeOccupantCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.allocationRate}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportPager
        page={p}
        totalPages={totalPages}
        hrefFor={(n) => `/corporate-housing/reports/occupancy?page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
