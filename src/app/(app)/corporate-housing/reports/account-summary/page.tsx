import Link from "next/link";
import { getCorporateAccountSummaryReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function CorporateAccountSummaryReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getCorporateAccountSummaryReport(page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.corporateHousing.reportAccountSummary}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colAccountNumber}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colDisplayName}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colActiveContracts}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.cardActiveOccupants}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colActiveAllocations}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/corporate-housing/accounts/${r.id}`} className="hover:underline">
                    {r.accountNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.displayName}</td>
                <td className="px-4 py-3 text-slate-500">{t.corporateAccountStatus[r.status]}</td>
                <td className="px-4 py-3 text-slate-500">{r.activeContractCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.activeOccupantCount}</td>
                <td className="px-4 py-3 text-slate-500">{r.activeAllocationCount}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportPager
        page={p}
        totalPages={totalPages}
        hrefFor={(n) => `/corporate-housing/reports/account-summary?page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
