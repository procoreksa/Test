import Link from "next/link";
import { getDisputedSettlementsReport } from "@/lib/actions/security-deposit-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function DisputedSettlementsReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = pageParam ? Number(pageParam) : 1;
  const [{ rows, page: currentPage, totalPages }, locale] = await Promise.all([getDisputedSettlementsReport(page), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.securityDeposit.reportDisputed}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colSettlementNumber}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colTenant}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colDescription}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.disputeStatusLabel}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.disputeNoteLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.flatMap((s) =>
              s.liabilityAssessments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/operations/settlements/${s.id}`} className="hover:underline">
                      {s.settlementNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, s.renter.fullNameAr, s.renter.fullName)}</td>
                  <td className="px-4 py-3 text-slate-500">{t.settlementStatus[s.status]}</td>
                  <td className="px-4 py-3 text-slate-500">{a.description}</td>
                  <td className="px-4 py-3 text-slate-500">{t.settlementDisputeStatus[a.disputeStatus]}</td>
                  <td className="px-4 py-3 text-slate-500">{a.disputeNote ?? "—"}</td>
                </tr>
              ))
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.securityDeposit.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between no-print">
        <span className="text-sm text-slate-500">{t.securityDeposit.pageOf(currentPage, totalPages)}</span>
        <div className="flex gap-2">
          {currentPage > 1 && (
            <Link href={`/operations/settlements/reports/disputed?page=${currentPage - 1}`} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.previous}
            </Link>
          )}
          {currentPage < totalPages && (
            <Link href={`/operations/settlements/reports/disputed?page=${currentPage + 1}`} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
