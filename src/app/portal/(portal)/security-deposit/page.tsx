import Link from "next/link";
import { getTenantContracts } from "@/lib/actions/portal/tenancy";
import { getTenantDepositPosition, getTenantSettlement } from "@/lib/actions/portal/security-deposit";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";

export default async function TenantSecurityDepositPage() {
  const { current, historical } = await getTenantContracts();
  const contractId = current?.id ?? historical[0]?.id;
  const [locale] = await Promise.all([getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);

  if (!contractId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.securityDepositTitle}</h1>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noCurrentTenancy}</div>
      </div>
    );
  }

  const [position, settlement] = await Promise.all([getTenantDepositPosition(contractId), getTenantSettlement(contractId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.securityDepositTitle}</h1>
        {settlement?.visibility === "FINAL" && (
          <Link href={`/portal/security-deposit/statement`} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
            {t.tenantPortal.printStatementButton}
          </Link>
        )}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-slate-900">{moneyFmt.format(Number(position.requiredDeposit))}</p>
            <p className="text-xs text-slate-500 mt-1">{t.tenantPortal.depositRequiredLabel}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">{moneyFmt.format(Number(position.availableDeposit))}</p>
            <p className="text-xs text-slate-500 mt-1">{t.tenantPortal.depositAvailableLabel}</p>
          </div>
        </div>
      </section>

      {!settlement ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noSettlementYet}</div>
      ) : (
        <>
          {settlement.visibility === "APPROVED_PENDING_POSTING" && (
            <p className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">{t.tenantPortal.settlementApprovedPendingPostingNotice}</p>
          )}

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.assessedDeductionsTitle}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-right">
                  <tr>
                    <th className="px-2 py-1 font-medium">{t.tenantPortal.colDeductionCategory}</th>
                    <th className="px-2 py-1 font-medium">{t.tenantPortal.colDeductionDescription}</th>
                    <th className="px-2 py-1 font-medium">{t.tenantPortal.colDeductionAmount}</th>
                    <th className="px-2 py-1 font-medium">{t.tenantPortal.colWaivedAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlement.assessments.map((a) => (
                    <tr key={a.id}>
                      <td className="px-2 py-1.5">{t.settlementDeductionCategory[a.category as keyof typeof t.settlementDeductionCategory]}</td>
                      <td className="px-2 py-1.5">{a.description}</td>
                      <td className="px-2 py-1.5">{moneyFmt.format(Number(a.approvedAmount))}</td>
                      <td className="px-2 py-1.5">{moneyFmt.format(Number(a.waivedAmount))}</td>
                    </tr>
                  ))}
                  {settlement.assessments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t.tenantPortal.depositAppliedLabel}</dt>
                <dd className="font-medium text-slate-800">{moneyFmt.format(Number(settlement.depositApplied ?? 0))}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t.tenantPortal.refundDueLabel}</dt>
                <dd className="font-medium text-slate-800">{moneyFmt.format(Number(settlement.refundDue ?? 0))}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t.tenantPortal.additionalAmountDueLabel}</dt>
                <dd className="font-medium text-slate-800">{moneyFmt.format(Number(settlement.additionalDue ?? 0))}</dd>
              </div>
              {settlement.visibility === "FINAL" && (
                <>
                  <div>
                    <dt className="text-slate-500">{t.tenantPortal.refundPaidLabel}</dt>
                    <dd className="font-medium text-slate-800">{moneyFmt.format(Number(settlement.refundPaid))}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t.tenantPortal.refundRemainingLabel}</dt>
                    <dd className="font-medium text-slate-800">{moneyFmt.format(Number(settlement.refundRemaining ?? 0))}</dd>
                  </div>
                </>
              )}
            </dl>
            {settlement.additionalDueInvoice && (
              <p className="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-4">
                {t.tenantPortal.additionalAmountDueInvoiceLabel}:{" "}
                <Link href={`/portal/invoices/${settlement.additionalDueInvoice.id}`} className="text-brand-gold-dark hover:underline">
                  {settlement.additionalDueInvoice.invoiceNumber}
                </Link>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
