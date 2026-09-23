import Link from "next/link";
import { getCorporateContractExpiryReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary, shortDateFormatter, currencyFormatter } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function CorporateContractExpiryReportPage({ searchParams }: { searchParams: Promise<{ window?: string; page?: string }> }) {
  const { window, page } = await searchParams;
  const windowDays = window === "60" ? 60 : window === "90" ? 90 : 30;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getCorporateContractExpiryReport(windowDays as 30 | 60 | 90, page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const moneyFmt = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.reportContractExpiry}</h1>
          <div className="flex gap-2 text-sm">
            {[30, 60, 90].map((d) => (
              <Link
                key={d}
                href={`/corporate-housing/reports/contract-expiry?window=${d}`}
                className={`px-3 py-1.5 rounded-lg ${windowDays === d ? "bg-brand-gold text-brand-black font-semibold" : "bg-slate-100 text-slate-600"}`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateAccount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colStartDate}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colPlannedEndDate}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colContractValue}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/contracts/${r.id}/edit`} className="hover:underline">
                    {r.contractNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{r.corporateAccount?.displayName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.startDate)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.endDate)}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(r.rentAmount))}</td>
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
        hrefFor={(n) => `/corporate-housing/reports/contract-expiry?window=${windowDays}&page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
