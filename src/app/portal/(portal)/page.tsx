import Link from "next/link";
import { getTenantDashboard } from "@/lib/actions/portal/dashboard";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function TenantDashboardPage() {
  const [data, locale] = await Promise.all([getTenantDashboard(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const { currentContract, nextPaymentDue, outstandingBalance, openMaintenanceCount, moveIn, moveOut, depositPosition, recentPayments } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.dashboardTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.tenantPortal.dashboardSubtitle}</p>
      </div>

      {!currentContract ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noCurrentTenancy}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.tenantPortal.cardCurrentContract}</p>
              <p className="text-lg font-bold mt-2 text-slate-900">
                <Link href="/portal/contracts" className="hover:underline">
                  {currentContract.contractNumber}
                </Link>
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.tenantPortal.cardUnit}</p>
              <p className="text-lg font-bold mt-2 text-slate-900">{currentContract.unit.unitNumber}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.tenantPortal.cardNextPaymentDue}</p>
              {nextPaymentDue ? (
                <>
                  <p className="text-lg font-bold mt-2 text-slate-900">{moneyFmt.format(Number(nextPaymentDue.amount))}</p>
                  <p className="text-xs text-slate-500 mt-1">{dateFmt.format(nextPaymentDue.dueDate)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">{t.tenantPortal.noUpcomingPayment}</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.tenantPortal.cardOutstandingBalance}</p>
              <p className="text-lg font-bold mt-2 text-slate-900">{moneyFmt.format(Number(outstandingBalance))}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.tenantPortal.cardOpenMaintenance}</p>
              <p className="text-lg font-bold mt-2 text-brand-gold-dark">
                <Link href="/portal/maintenance" className="hover:underline">
                  {openMaintenanceCount}
                </Link>
              </p>
            </div>
            {moveIn && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-500 text-sm">{t.tenantPortal.cardMoveInStatus}</p>
                <p className="text-lg font-bold mt-2 text-slate-900">{t.moveInStatus[moveIn.status]}</p>
              </div>
            )}
            {moveOut && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-500 text-sm">{t.tenantPortal.cardMoveOutStatus}</p>
                <p className="text-lg font-bold mt-2 text-slate-900">{t.moveOutStatus[moveOut.status]}</p>
              </div>
            )}
            {depositPosition && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-500 text-sm">{t.tenantPortal.cardDepositPosition}</p>
                <p className="text-lg font-bold mt-2 text-slate-900">
                  <Link href="/portal/security-deposit" className="hover:underline">
                    {moneyFmt.format(Number(depositPosition.availableDeposit))}
                  </Link>
                </p>
              </div>
            )}
          </div>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.cardRecentReceipts}</h2>
            <ul className="text-sm divide-y divide-slate-100">
              {recentPayments.map((p) => (
                <li key={p.id} className="py-2 flex justify-between">
                  <span className="text-slate-600">
                    {p.receiptNumber} — {dateFmt.format(p.paymentDate)}
                  </span>
                  <span className="font-medium text-slate-800">{moneyFmt.format(Number(p.amount))}</span>
                </li>
              ))}
              {recentPayments.length === 0 && <li className="py-2 text-slate-400">{t.tenantPortal.emptyPayments}</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
