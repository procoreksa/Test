import Link from "next/link";
import {
  getSecurityDepositSettlementById,
  submitSettlementForReview,
  reviewSettlement,
  approveSettlement,
  reopenSettlementForCorrection,
  cancelSettlement,
  addLiabilityAssessment,
  updateLiabilityAssessment,
  updateAssessmentDispute,
  addSettlementNote,
  postSecurityDepositSettlement,
  recordSecurityDepositRefund,
} from "@/lib/actions/security-deposits";
import { getMoveOutById } from "@/lib/actions/move-outs";
import { isSettlementEditable } from "@/lib/security-deposit-rules";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";
import type { SettlementResponsibility, SettlementDeductionCategory, SettlementDisputeStatus, AssessmentSourceType, PaymentMethod } from "@prisma/client";

export default async function SettlementWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, role, locale] = await Promise.all([getSecurityDepositSettlementById(id), getCurrentUserRole(), getLocale()]);
  const { settlement, requiredDeposit, availableDeposit, proposedTenantAmount, approvalBlockers, liveOutcome, refundPaid, refundRemaining } = data;
  const { moveOut } = await getMoveOutById(settlement.moveOutId);

  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canAssess = can("securityDeposit.assess", role);
  const canReview = can("securityDeposit.review", role);
  const canApprove = can("securityDeposit.approve", role);
  const canPost = can("securityDeposit.post", role);
  const canDispute = can("securityDeposit.dispute.manage", role);
  const canRefund = can("securityDeposit.refund.manage", role);
  const canViewRefund = can("securityDeposit.refund.view", role) || canRefund;

  const editable = isSettlementEditable(settlement.status);
  const isTerminal = settlement.status === "SETTLED" || settlement.status === "CANCELLED";
  const isCancellable = settlement.status === "DRAFT" || settlement.status === "UNDER_REVIEW" || settlement.status === "PENDING_APPROVAL";

  const tenantAssessments = settlement.liabilityAssessments;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/settlements" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.securityDeposit.listTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{settlement.settlementNumber}</h1>
            <p className="text-slate-500 text-sm mt-1">{t.settlementStatus[settlement.status]}</p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            {canAssess && settlement.status === "DRAFT" && (
              <form action={async () => { "use server"; await submitSettlementForReview(settlement.id); }}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.submitForReviewButton}</button>
              </form>
            )}
            {canReview && settlement.status === "UNDER_REVIEW" && (
              <>
                <form action={async () => { "use server"; await reviewSettlement(settlement.id, "FORWARD"); }}>
                  <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.reviewForwardButton}</button>
                </form>
                <form action={async () => { "use server"; await reviewSettlement(settlement.id, "BACK"); }}>
                  <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.securityDeposit.reviewBackButton}</button>
                </form>
              </>
            )}
            {canApprove && settlement.status === "PENDING_APPROVAL" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                  {t.securityDeposit.approveButton}
                </summary>
                <div className="absolute z-10 end-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.securityDeposit.approvalPreviewTitle}</h3>
                  <p className="text-xs text-slate-600">{t.securityDeposit.approvalPreviewBody}</p>
                  <dl className="text-xs grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-2">
                    <dt className="text-slate-500">{t.securityDeposit.depositAvailableLabel}</dt>
                    <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(availableDeposit))}</dd>
                    <dt className="text-slate-500">{t.securityDeposit.totalApprovedTenantLabel}</dt>
                    <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(data.approvedTenantAmountLive))}</dd>
                    <dt className="text-slate-500">{t.securityDeposit.outcomeDepositAppliedLabel}</dt>
                    <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(liveOutcome.depositApplied))}</dd>
                    <dt className="text-slate-500">{t.securityDeposit.outcomeRefundDueLabel}</dt>
                    <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(liveOutcome.refundDue))}</dd>
                    <dt className="text-slate-500">{t.securityDeposit.outcomeAdditionalDueLabel}</dt>
                    <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(liveOutcome.additionalDue))}</dd>
                  </dl>
                  {approvalBlockers.includes("UNDETERMINED_RESPONSIBILITY_EXISTS") && <p className="text-xs text-red-600">{t.securityDeposit.approvalBlockedUndeterminedNotice}</p>}
                  {approvalBlockers.includes("UNRESOLVED_DISPUTE_EXISTS") && <p className="text-xs text-red-600">{t.securityDeposit.approvalBlockedDisputeNotice}</p>}
                  <form action={async () => { "use server"; await approveSettlement(settlement.id); }}>
                    <button disabled={approvalBlockers.length > 0} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                      {t.securityDeposit.approveButton}
                    </button>
                  </form>
                </div>
              </details>
            )}
            {canApprove && (settlement.status === "PENDING_APPROVAL" || settlement.status === "APPROVED") && (
              <form action={async () => { "use server"; await reopenSettlementForCorrection(settlement.id); }}>
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.securityDeposit.reopenForCorrectionButton}</button>
              </form>
            )}
            {canPost && settlement.status === "APPROVED" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.postButton}</summary>
                <div className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.securityDeposit.postingPreviewTitle}</h3>
                  <p className="text-xs text-slate-600">{t.securityDeposit.postingPreviewBody}</p>
                  <form action={async () => { "use server"; await postSecurityDepositSettlement(settlement.id); }}>
                    <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.postButton}</button>
                  </form>
                </div>
              </details>
            )}
            {canReview && isCancellable && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.cancelButton}</summary>
                <form action={cancelSettlement} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <input type="hidden" name="settlementId" value={settlement.id} />
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.securityDeposit.cancelReasonLabel}</label>
                  <textarea name="reason" required rows={2} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.confirmCancelButton}</button>
                </form>
              </details>
            )}
            <Link href={`/operations/settlements/${settlement.id}/statement`} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
              {t.securityDeposit.reportTitle}
            </Link>
          </div>
        </div>
      </div>

      {/* Summary: Contract / Tenant / Unit / Move-Out */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionSummary}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.securityDeposit.fieldContract}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            <Link href={`/contracts/${settlement.contract.id}/edit`} className="text-brand-gold-dark hover:underline">
              {settlement.contract.contractNumber}
            </Link>
          </dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">{pickLocalized(locale, settlement.renter.fullNameAr, settlement.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            {settlement.unit.unitNumber} — {unitLocationLabel(locale, settlement.unit)}
          </dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldMoveOut}</dt>
          <dd className="text-slate-800 font-medium">
            <Link href={`/operations/move-outs/${settlement.moveOut.id}`} className="text-brand-gold-dark hover:underline">
              {settlement.moveOut.moveOutNumber}
            </Link>
          </dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldPreparedBy}</dt>
          <dd className="text-slate-800 font-medium">{settlement.preparedByUserId}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldReviewedBy}</dt>
          <dd className="text-slate-800 font-medium">{settlement.reviewedByUserId ?? t.securityDeposit.notSet}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldApprovedBy}</dt>
          <dd className="text-slate-800 font-medium">{settlement.approvedByUserId ?? t.securityDeposit.notSet}</dd>
          <dt className="text-slate-500">{t.securityDeposit.fieldPostedBy}</dt>
          <dd className="text-slate-800 font-medium">{settlement.postedByUserId ?? t.securityDeposit.notSet}</dd>
        </dl>
      </section>

      {/* Deposit position */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionDepositPosition}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
          <Stat label={t.securityDeposit.depositRequiredLabel} value={moneyFmt.format(Number(requiredDeposit))} />
          <Stat label={t.securityDeposit.depositCollectedLabel} value={moneyFmt.format(Number(availableDeposit))} />
          <Stat label={t.securityDeposit.depositAvailableLabel} value={moneyFmt.format(Number(availableDeposit))} tone="text-emerald-600" />
        </div>
        {availableDeposit.greaterThan(requiredDeposit) && <p className="text-xs text-amber-600 mt-3">{t.securityDeposit.depositOverCollectedNotice}</p>}
      </section>

      {/* Findings + assessments */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-1">{t.securityDeposit.sectionAssessments}</h2>
        <p className="text-xs text-slate-400 mb-3">{t.securityDeposit.findingNotLiabilityNotice}</p>

        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colCategory}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colDescription}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colEvidence}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colResponsibility}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colProposed}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colApproved}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colWaived}</th>
                <th className="px-2 py-1 font-medium">{t.securityDeposit.colDispute}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenantAssessments.map((a) => {
                const evidenceLabel =
                  a.moveOutInspectionItem?.itemName ?? a.moveOutInventoryItem?.itemName ?? a.moveOutKeyItem?.description ?? a.maintenanceRequest?.requestNumber ?? "—";
                return (
                  <tr key={a.id}>
                    <td className="px-2 py-1.5">{t.settlementDeductionCategory[a.category]}</td>
                    <td className="px-2 py-1.5">{a.description}</td>
                    <td className="px-2 py-1.5 text-slate-500">{evidenceLabel}</td>
                    <td className="px-2 py-1.5">{t.settlementResponsibility[a.responsibility]}</td>
                    <td className="px-2 py-1.5">{moneyFmt.format(Number(a.proposedAmount))}</td>
                    <td className="px-2 py-1.5">{a.approvedAmount !== null ? moneyFmt.format(Number(a.approvedAmount)) : "—"}</td>
                    <td className="px-2 py-1.5">{moneyFmt.format(Number(a.waivedAmount))}</td>
                    <td className="px-2 py-1.5">{t.settlementDisputeStatus[a.disputeStatus]}</td>
                  </tr>
                );
              })}
              {tenantAssessments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-slate-400">
                    {t.securityDeposit.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canAssess && editable && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            {tenantAssessments.map((a) => (
              <details key={a.id} className="bg-slate-50 rounded-lg px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">{a.description}</summary>
                <form action={updateLiabilityAssessment} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end mt-2">
                  <input type="hidden" name="assessmentId" value={a.id} />
                  <select name="responsibility" defaultValue={a.responsibility} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                    {(Object.keys(t.settlementResponsibility) as SettlementResponsibility[]).map((v) => (
                      <option key={v} value={v}>
                        {t.settlementResponsibility[v]}
                      </option>
                    ))}
                  </select>
                  <input name="proposedAmount" type="number" step="0.01" min="0" defaultValue={a.proposedAmount.toString()} placeholder={t.securityDeposit.proposedAmountLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                  <input
                    name="approvedAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={a.approvedAmount?.toString() ?? ""}
                    placeholder={t.securityDeposit.approvedAmountLabel}
                    disabled={!canApprove}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <input name="waivedAmount" type="number" step="0.01" min="0" defaultValue={a.waivedAmount.toString()} placeholder={t.securityDeposit.waivedAmountLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                  <input name="waiverReason" defaultValue={a.waiverReason ?? ""} placeholder={t.securityDeposit.waiverReasonLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs col-span-2" />
                  <input name="assessmentReason" defaultValue={a.assessmentReason ?? ""} placeholder={t.securityDeposit.assessmentReasonLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs col-span-2" />
                  <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.securityDeposit.saveButton}</button>
                </form>
                {canDispute && (
                  <form action={updateAssessmentDispute} className="flex flex-wrap items-end gap-2 mt-2">
                    <input type="hidden" name="assessmentId" value={a.id} />
                    <select name="disputeStatus" defaultValue={a.disputeStatus} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {(Object.keys(t.settlementDisputeStatus) as SettlementDisputeStatus[]).map((v) => (
                        <option key={v} value={v}>
                          {t.settlementDisputeStatus[v]}
                        </option>
                      ))}
                    </select>
                    <input name="disputeNote" defaultValue={a.disputeNote ?? ""} placeholder={t.securityDeposit.disputeNoteLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.securityDeposit.saveButton}</button>
                  </form>
                )}
              </details>
            ))}

            <details className="bg-slate-50 rounded-lg px-3 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t.securityDeposit.addAssessmentFromFindingButton}</summary>
              <form action={addLiabilityAssessment} className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end mt-3">
                <input type="hidden" name="settlementId" value={settlement.id} />
                <select name="sourceType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs col-span-2 sm:col-span-1">
                  {(Object.keys(t.assessmentSourceType) as AssessmentSourceType[]).map((v) => (
                    <option key={v} value={v}>
                      {t.assessmentSourceType[v]}
                    </option>
                  ))}
                </select>
                <select name="moveOutInspectionItemId" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="">{t.securityDeposit.colEvidence} — {t.assessmentSourceType.INSPECTION_ITEM}</option>
                  {moveOut.inspectionItems.filter((i) => i.requiresAttention || i.condition === "DAMAGED" || i.condition === "NOT_WORKING" || i.condition === "POOR").map((i) => (
                    <option key={i.id} value={i.id}>
                      {pickLocalized(locale, i.itemNameAr, i.itemName)} ({i.condition ? t.conditionRating[i.condition] : "—"})
                    </option>
                  ))}
                </select>
                <select name="moveOutInventoryItemId" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="">{t.securityDeposit.colEvidence} — {t.assessmentSourceType.INVENTORY_ITEM}</option>
                  {moveOut.inventoryItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.itemName}
                    </option>
                  ))}
                </select>
                <select name="moveOutKeyItemId" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="">{t.securityDeposit.colEvidence} — {t.assessmentSourceType.KEY_ITEM}</option>
                  {moveOut.keyItems.map((k) => (
                    <option key={k.id} value={k.id}>
                      {t.keyType[k.keyType]} — {k.description}
                    </option>
                  ))}
                </select>
                <select name="maintenanceRequestId" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="">{t.securityDeposit.colEvidence} — {t.assessmentSourceType.MAINTENANCE_REQUEST}</option>
                  {moveOut.maintenanceRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.requestNumber} — {r.title}
                    </option>
                  ))}
                </select>
                <input name="description" required placeholder={t.securityDeposit.descriptionLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs col-span-2 sm:col-span-1" />
                <select name="category" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  {(Object.keys(t.settlementDeductionCategory) as SettlementDeductionCategory[]).map((v) => (
                    <option key={v} value={v}>
                      {t.settlementDeductionCategory[v]}
                    </option>
                  ))}
                </select>
                <select name="responsibility" defaultValue="UNDETERMINED" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  {(Object.keys(t.settlementResponsibility) as SettlementResponsibility[]).map((v) => (
                    <option key={v} value={v}>
                      {t.settlementResponsibility[v]}
                    </option>
                  ))}
                </select>
                <input name="proposedAmount" type="number" step="0.01" min="0" defaultValue="0" placeholder={t.securityDeposit.proposedAmountLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <input name="assessmentReason" placeholder={t.securityDeposit.assessmentReasonLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs col-span-2" />
                <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 py-1.5 text-xs font-medium">{t.securityDeposit.addAssessmentFromFindingButton}</button>
              </form>
            </details>
          </div>
        )}
      </section>

      {/* Calculation summary */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionCalculationSummary}</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 text-sm">
          <Field label={t.securityDeposit.totalProposedTenantLabel} value={moneyFmt.format(Number(proposedTenantAmount))} />
          <Field label={t.securityDeposit.totalApprovedTenantLabel} value={moneyFmt.format(Number(data.approvedTenantAmountLive))} />
          <Field label={t.securityDeposit.totalWaivedTenantLabel} value={moneyFmt.format(Number(data.waivedTenantAmount))} />
          <Field label={t.securityDeposit.outcomeDepositAppliedLabel} value={moneyFmt.format(Number(settlement.approvedDepositApplied ?? liveOutcome.depositApplied))} />
          <Field label={t.securityDeposit.outcomeRefundDueLabel} value={moneyFmt.format(Number(settlement.approvedRefundDue ?? liveOutcome.refundDue))} />
          <Field label={t.securityDeposit.outcomeAdditionalDueLabel} value={moneyFmt.format(Number(settlement.approvedAdditionalDue ?? liveOutcome.additionalDue))} />
        </dl>
      </section>

      {/* Refund */}
      {canViewRefund && (settlement.status === "POSTED" || settlement.status === "PARTIALLY_SETTLED" || settlement.status === "SETTLED") && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionRefund}</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 text-sm mb-4">
            <Field label={t.securityDeposit.refundDueLabel} value={moneyFmt.format(Number(settlement.approvedRefundDue ?? 0))} />
            <Field label={t.securityDeposit.refundPaidLabel} value={moneyFmt.format(Number(refundPaid))} />
            <Field label={t.securityDeposit.refundRemainingLabel} value={moneyFmt.format(Number(refundRemaining))} />
          </dl>
          <ul className="text-sm space-y-1 mb-4">
            {settlement.refunds.map((r) => (
              <li key={r.id} className="text-slate-600">
                {moneyFmt.format(Number(r.amount))} — {r.method ? t.paymentMethod[r.method] : "—"} {r.referenceNumber ? `(${r.referenceNumber})` : ""} — {r.paidAt ? dateTimeFmt.format(r.paidAt) : ""}
              </li>
            ))}
            {settlement.refunds.length === 0 && <li className="text-slate-400">{t.securityDeposit.refundHistoryEmpty}</li>}
          </ul>
          {canRefund && refundRemaining.greaterThan(0) && (
            <form
              action={async (formData: FormData) => {
                "use server";
                await recordSecurityDepositRefund(formData);
              }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end"
            >
              <input type="hidden" name="settlementId" value={settlement.id} />
              <input name="amount" type="number" step="0.01" min="0.01" max={refundRemaining.toString()} required placeholder={t.securityDeposit.refundAmountLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <select name="method" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {(Object.keys(t.paymentMethod) as PaymentMethod[]).map((v) => (
                  <option key={v} value={v}>
                    {t.paymentMethod[v]}
                  </option>
                ))}
              </select>
              <input name="referenceNumber" placeholder={t.securityDeposit.refundReferenceLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="notes" placeholder={t.securityDeposit.refundNotesLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium col-span-2 sm:col-span-1">{t.securityDeposit.recordRefundButton}</button>
            </form>
          )}
        </section>
      )}

      {/* Additional amount due */}
      {Number(settlement.approvedAdditionalDue ?? 0) > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionAdditionalDue}</h2>
          {settlement.additionalDueInvoices.length > 0 ? (
            <ul className="text-sm space-y-1">
              {settlement.additionalDueInvoices.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="text-brand-gold-dark hover:underline">
                    {inv.invoiceNumber}
                  </Link>{" "}
                  — {moneyFmt.format(Number(inv.totalAmount))} ({t.invoiceStatus[inv.status]})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">{t.securityDeposit.additionalDueEmpty}</p>
          )}
        </section>
      )}

      {/* Financial references */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionFinancialReferences}</h2>
        <p className="text-xs text-slate-500">
          {t.securityDeposit.fieldContract}: {settlement.contract.contractNumber} — {t.securityDeposit.depositRequiredLabel}: {moneyFmt.format(Number(requiredDeposit))}
        </p>
      </section>

      {/* Notes */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.securityDeposit.sectionNotes}</h2>
        <ul className="text-sm space-y-2 mb-4">
          {settlement.notesLog.map((n) => (
            <li key={n.id} className="text-slate-600">
              <span className="text-slate-400 text-xs">{dateTimeFmt.format(n.createdAt)}</span> — {n.note}
            </li>
          ))}
          {settlement.notesLog.length === 0 && <li className="text-slate-400">{t.securityDeposit.notesEmpty}</li>}
        </ul>
        {!isTerminal && (
          <form action={addSettlementNote} className="flex items-end gap-2">
            <input type="hidden" name="settlementId" value={settlement.id} />
            <input name="note" required placeholder={t.securityDeposit.noteLabel} className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-1.5 text-sm font-medium">{t.securityDeposit.addNoteButton}</button>
          </form>
        )}
      </section>

      <AuditTimeline entityType="SecurityDepositSettlement" entityId={settlement.id} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
