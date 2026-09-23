import Link from "next/link";
import { getRefundReport } from "@/lib/actions/security-deposit-reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function RefundReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = pageParam ? Number(pageParam) : 1;
  const [{ rows, page: currentPage, totalPages }, locale] = await Promise.all([getRefundReport(page), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.securityDeposit.reportRefund}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colSettlementNumber}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colTenant}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.refundDueLabel}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.refundPaidLabel}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.refundRemainingLabel}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colLastRefundDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/settlements/${s.id}`} className="hover:underline">
                    {s.settlementNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, s.renter.fullNameAr, s.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(s.refundDue))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(s.refundPaid))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(s.refundRemaining))}</td>
                <td className="px-4 py-3 text-slate-500">{t.settlementStatus[s.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{s.lastRefundDate ? dateFmt.format(s.lastRefundDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
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
            <Link href={`/operations/settlements/reports/refund?page=${currentPage - 1}`} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.previous}
            </Link>
          )}
          {currentPage < totalPages && (
            <Link href={`/operations/settlements/reports/refund?page=${currentPage + 1}`} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
