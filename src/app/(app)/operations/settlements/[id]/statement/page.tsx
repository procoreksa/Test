import { getSecurityDepositSettlementById } from "@/lib/actions/security-deposits";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { getLocale, getDictionary, currencyFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";

export default async function SettlementStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, org, locale] = await Promise.all([getSecurityDepositSettlementById(id), getOrganizationBranding(), getLocale()]);
  const { settlement, requiredDeposit, availableDeposit, refundPaid, refundRemaining } = data;
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const isFinal = settlement.status === "POSTED" || settlement.status === "PARTIALLY_SETTLED" || settlement.status === "SETTLED";
  const hasUnresolvedDispute = settlement.liabilityAssessments.some((a) => a.disputeStatus === "RAISED" || a.disputeStatus === "UNDER_REVIEW");

  const depositApplied = settlement.approvedDepositApplied ?? data.liveOutcome.depositApplied;
  const refundDue = settlement.approvedRefundDue ?? data.liveOutcome.refundDue;
  const additionalDue = settlement.approvedAdditionalDue ?? data.liveOutcome.additionalDue;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            )}
            <div>
              <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
              <p className="text-xs text-slate-500">{t.securityDeposit.reportOrgLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">{t.securityDeposit.reportTitle}</h1>
            <p className="text-sm text-slate-500">{t.securityDeposit.reportSubtitle(settlement.settlementNumber)}</p>
          </div>
        </div>

        {(!isFinal || hasUnresolvedDispute) && (
          <p className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">{t.securityDeposit.reportNotFinalWhileDisputed}</p>
        )}

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.securityDeposit.fieldContract}</dt>
          <dd className="text-slate-800 font-medium">{settlement.contract.contractNumber}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium">{pickLocalized(locale, settlement.renter.fullNameAr, settlement.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium">
            {settlement.unit.unitNumber} — {unitLocationLabel(locale, settlement.unit)}
          </dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldMoveOut}</dt>
          <dd className="text-slate-800 font-medium">{settlement.moveOut.moveOutNumber}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldStatus}</dt>
          <dd className="text-slate-800 font-medium">{t.settlementStatus[settlement.status]}</dd>
        </dl>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionDepositPosition}</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.securityDeposit.depositRequiredLabel}</dt>
            <dd className="text-slate-800 font-medium col-span-2">{moneyFmt.format(Number(requiredDeposit))}</dd>
            <dt className="text-slate-500">{t.securityDeposit.depositAvailableLabel}</dt>
            <dd className="text-slate-800 font-medium col-span-2">{moneyFmt.format(Number(availableDeposit))}</dd>
          </dl>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionAssessments}</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-right">
                <th className="py-1 font-medium">{t.securityDeposit.colCategory}</th>
                <th className="py-1 font-medium">{t.securityDeposit.colDescription}</th>
                <th className="py-1 font-medium">{t.securityDeposit.colResponsibility}</th>
                <th className="py-1 font-medium">{t.securityDeposit.colProposed}</th>
                <th className="py-1 font-medium">{t.securityDeposit.colApproved}</th>
                <th className="py-1 font-medium">{t.securityDeposit.colWaived}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlement.liabilityAssessments.map((a) => (
                <tr key={a.id}>
                  <td className="py-1 text-slate-700">{t.settlementDeductionCategory[a.category]}</td>
                  <td className="py-1 text-slate-600">{pickLocalized(locale, a.descriptionAr, a.description)}</td>
                  <td className="py-1 text-slate-600">{t.settlementResponsibility[a.responsibility]}</td>
                  <td className="py-1 text-slate-600">{moneyFmt.format(Number(a.proposedAmount))}</td>
                  <td className="py-1 text-slate-600">{a.approvedAmount !== null ? moneyFmt.format(Number(a.approvedAmount)) : "—"}</td>
                  <td className="py-1 text-slate-500">{moneyFmt.format(Number(a.waivedAmount))}</td>
                </tr>
              ))}
              {settlement.liabilityAssessments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-center text-slate-400">
                    {t.securityDeposit.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionCalculationSummary}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.securityDeposit.outcomeDepositAppliedLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(depositApplied))}</dd>
            <dt className="text-slate-500">{t.securityDeposit.outcomeRefundDueLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(refundDue))}</dd>
            <dt className="text-slate-500">{t.securityDeposit.outcomeAdditionalDueLabel}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(additionalDue))}</dd>
          </dl>
        </div>

        {isFinal && (
          <div>
            <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionRefund}</h2>
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.securityDeposit.refundDueLabel}</dt>
              <dd className="text-slate-800 font-medium col-span-2">{moneyFmt.format(Number(refundDue))}</dd>
              <dt className="text-slate-500">{t.securityDeposit.refundPaidLabel}</dt>
              <dd className="text-slate-800 font-medium col-span-2">{moneyFmt.format(Number(refundPaid))}</dd>
              <dt className="text-slate-500">{t.securityDeposit.refundRemainingLabel}</dt>
              <dd className="text-slate-800 font-medium col-span-2">{moneyFmt.format(Number(refundRemaining))}</dd>
            </dl>
          </div>
        )}

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.securityDeposit.sectionFinancialReferences}</h2>
          <ul className="text-xs text-slate-600 space-y-1">
            {settlement.additionalDueInvoices.map((inv) => (
              <li key={inv.id}>
                {inv.invoiceNumber} — {moneyFmt.format(Number(inv.totalAmount))}
              </li>
            ))}
            {settlement.refunds.map((r) => (
              <li key={r.id}>
                {r.method ? t.paymentMethod[r.method] : "—"} — {moneyFmt.format(Number(r.amount))} {r.referenceNumber ? `(${r.referenceNumber})` : ""}
              </li>
            ))}
            {settlement.additionalDueInvoices.length === 0 && settlement.refunds.length === 0 && <li className="text-slate-400">{t.securityDeposit.financialReferencesEmpty}</li>}
          </ul>
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
