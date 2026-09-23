import Link from "next/link";
import { getPlannedDeparturesReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function PlannedDeparturesReportPage({ searchParams }: { searchParams: Promise<{ window?: string; page?: string }> }) {
  const { window, page } = await searchParams;
  const windowDays = window === "7" ? 7 : 30;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getPlannedDeparturesReport(windowDays, page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.reportPlannedDepartures}</h1>
          <div className="flex gap-2 text-sm">
            <Link href="/corporate-housing/reports/planned-departures?window=7" className={`px-3 py-1.5 rounded-lg ${windowDays === 7 ? "bg-brand-gold text-brand-black font-semibold" : "bg-slate-100 text-slate-600"}`}>
              7d
            </Link>
            <Link href="/corporate-housing/reports/planned-departures?window=30" className={`px-3 py-1.5 rounded-lg ${windowDays === 30 ? "bg-brand-gold text-brand-black font-semibold" : "bg-slate-100 text-slate-600"}`}>
              30d
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colAllocationNumber}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateAccount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colOccupant}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colPlannedEndDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/corporate-housing/allocations/${r.id}`} className="hover:underline">
                    {r.allocationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{r.corporateAccount.displayName}</td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, r.occupant.fullNameAr, r.occupant.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{r.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.plannedEndDate ? dateFmt.format(r.plannedEndDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportPager
        page={p}
        totalPages={totalPages}
        hrefFor={(n) => `/corporate-housing/reports/planned-departures?window=${windowDays}&page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
