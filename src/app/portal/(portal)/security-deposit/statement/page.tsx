import { getTenantContracts, getTenantOrganizationBranding } from "@/lib/actions/portal/tenancy";
import { getTenantDepositPosition, getTenantSettlement } from "@/lib/actions/portal/security-deposit";
import { getLocale, getDictionary, currencyFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import { redirect } from "next/navigation";

/** Step 50 - the tenant-safe printable statement, built only from the same visibility-gated read (getTenantSettlement()) the workspace page itself uses - no internal audit/history is ever available to this page in the first place. */
export default async function TenantSettlementStatementPage() {
  const { current, historical } = await getTenantContracts();
  const contractId = current?.id ?? historical[0]?.id;
  if (!contractId) redirect("/portal/security-deposit");

  const [position, settlement, org, locale] = await Promise.all([
    getTenantDepositPosition(contractId),
    getTenantSettlement(contractId),
    getTenantOrganizationBranding(),
    getLocale(),
  ]);
  if (!settlement || settlement.visibility !== "FINAL") redirect("/portal/security-deposit");

  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);
  const contract = current ?? historical[0];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">{t.securityDeposit.reportTitle}</h1>
            <p className="text-sm text-slate-500">{t.securityDeposit.reportSubtitle(settlement.settlementNumber)}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.tenantPortal.fieldContractNumber}</dt>
          <dd className="text-slate-800 font-medium">{contract?.contractNumber}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldStatus}</dt>
          <dd className="text-slate-800 font-medium">{t.settlementStatus[settlement.status as keyof typeof t.settlementStatus]}</dd>
        </dl>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.tenantPortal.cardDepositPosition}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.tenantPortal.depositRequiredLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(position.requiredDeposit))}</dd>
            <dt className="text-slate-500">{t.tenantPortal.depositAvailableLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(position.availableDeposit))}</dd>
          </dl>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.tenantPortal.assessedDeductionsTitle}</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-right">
                <th className="py-1 font-medium">{t.tenantPortal.colDeductionCategory}</th>
                <th className="py-1 font-medium">{t.tenantPortal.colDeductionDescription}</th>
                <th className="py-1 font-medium">{t.tenantPortal.colDeductionAmount}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlement.assessments.map((a) => (
                <tr key={a.id}>
                  <td className="py-1 text-slate-700">{t.settlementDeductionCategory[a.category as keyof typeof t.settlementDeductionCategory]}</td>
                  <td className="py-1 text-slate-600">{a.description}</td>
                  <td className="py-1 text-slate-600">{moneyFmt.format(Number(a.approvedAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionCalculationSummary}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.tenantPortal.depositAppliedLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(settlement.depositApplied ?? 0))}</dd>
            <dt className="text-slate-500">{t.tenantPortal.refundDueLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(settlement.refundDue ?? 0))}</dd>
            <dt className="text-slate-500">{t.tenantPortal.refundPaidLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(settlement.refundPaid))}</dd>
            <dt className="text-slate-500">{t.tenantPortal.additionalAmountDueLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(settlement.additionalDue ?? 0))}</dd>
          </dl>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500 leading-relaxed">{t.securityDeposit.reportDisclaimer}</p>
        </div>

        <p className="text-xs text-slate-400 text-center border-t border-slate-100 pt-3">
          {t.securityDeposit.reportPrintedOn} {dateTimeFmt.format(new Date())}
        </p>
      </div>
    </div>
  );
}
