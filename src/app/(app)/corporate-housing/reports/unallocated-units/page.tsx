import Link from "next/link";
import { getUnallocatedCorporateUnitsReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function UnallocatedCorporateUnitsReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getUnallocatedCorporateUnitsReport(page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.corporateHousing.reportUnallocatedUnits}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.corporateHousing.cardUnallocatedUnits}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateAccount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="px-4 py-3 font-medium text-slate-800">{r.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500">{r.contractNumber}</td>
                <td className="px-4 py-3 text-slate-500">{r.corporateAccount?.displayName ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportPager
        page={p}
        totalPages={totalPages}
        hrefFor={(n) => `/corporate-housing/reports/unallocated-units?page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
