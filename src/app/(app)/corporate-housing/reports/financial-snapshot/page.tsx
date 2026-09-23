import Link from "next/link";
import { getCorporateFinancialSnapshotReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function CorporateFinancialSnapshotReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getCorporateFinancialSnapshotReport(page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.corporateHousing.reportFinancialSnapshot}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.corporateHousing.dashboardSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colDisplayName}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colContractValue}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colInvoiced}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colPaid}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colOutstanding}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colOverdue}</th>
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
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(r.contractValue))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(r.invoiced))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(r.paid))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(r.outstanding))}</td>
                <td className="px-4 py-3 text-red-600">{moneyFmt.format(Number(r.overdue))}</td>
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
        hrefFor={(n) => `/corporate-housing/reports/financial-snapshot?page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
