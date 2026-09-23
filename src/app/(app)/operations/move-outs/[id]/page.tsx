import Link from "next/link";
import {
  getMoveOutById,
  scheduleMoveOut,
  startMoveOut,
  updateInspectionItem,
  addInventoryItem,
  addMeterReading,
  addKeyItem,
  setNoKeysToReturn,
  addAttachmentMetadata,
  setVacateDate,
  recordTenantAcknowledgement,
  setTenantAcknowledgementOverride,
  recordStaffAcknowledgement,
  advanceToFindingsReview,
  reviewMoveOutFindings,
  reopenMoveOutStage,
  completeMoveOut,
  cancelMoveOut,
} from "@/lib/actions/move-outs";
import { createMaintenanceRequestFromMoveOut } from "@/lib/actions/maintenance";
import { getSettlementForMoveOut, createSecurityDepositSettlement } from "@/lib/actions/security-deposits";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeConditionComparisonLabel } from "@/lib/operations/move-out-rules";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";
import type { InspectionCategory, ConditionRating, MeterType, KeyType, MoveOutCancelReason } from "@prisma/client";

function fmtDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 16);
}

async function createMaintenanceRequestFromFinding(formData: FormData) {
  "use server";
  const moveOutId = formData.get("moveOutId");
  await createMaintenanceRequestFromMoveOut(formData);
  if (typeof moveOutId === "string") revalidatePath(`/operations/move-outs/${moveOutId}`);
}

export default async function MoveOutProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ moveOut, progress, defects, findingsReviewEligible, completion, overdue, baselineMoveIn, inventoryDiff, meterConsumption, keyReconciliation }, role, locale] = await Promise.all([
    getMoveOutById(id),
    getCurrentUserRole(),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canViewSettlement = can("securityDeposit.view", role);
  const canCreateSettlement = can("securityDeposit.create", role);
  const settlement = canViewSettlement && moveOut.status === "COMPLETED" ? await getSettlementForMoveOut(moveOut.id) : null;

  const canUpdate = can("moveOut.update", role);
  const canStart = can("moveOut.start", role);
  const canComplete = can("moveOut.complete", role);
  const canCancel = can("moveOut.cancel", role);
  const canInspect = can("moveOutInspection.update", role);
  const canCreateMaintenance = can("maintenance.request.create", role);
  const editable = moveOut.status === "IN_PROGRESS" || moveOut.status === "PENDING_FINDINGS_REVIEW";
  const isTerminal = moveOut.status === "COMPLETED" || moveOut.status === "CANCELLED";

  const itemsByCategory = new Map<InspectionCategory, typeof moveOut.inspectionItems>();
  for (const item of moveOut.inspectionItems) {
    const arr = itemsByCategory.get(item.category) ?? [];
    arr.push(item);
    itemsByCategory.set(item.category, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/move-outs" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.moveOut.listTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{moveOut.moveOutNumber}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {t.moveOutStatus[moveOut.status]}
              {overdue && <span className="ms-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t.moveOut.filterOverdueOnly}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            {canStart && (moveOut.status === "DRAFT" || moveOut.status === "SCHEDULED") && (
              <form action={async () => { "use server"; await startMoveOut(moveOut.id); }}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.moveOut.startButton}</button>
              </form>
            )}
            {canUpdate && moveOut.status === "IN_PROGRESS" && (
              <form action={async () => { "use server"; await advanceToFindingsReview(moveOut.id); }}>
                <button disabled={!findingsReviewEligible} className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                  {t.moveOut.advanceToFindingsReviewButton}
                </button>
              </form>
            )}
            {canUpdate && moveOut.status === "PENDING_FINDINGS_REVIEW" && (
              <>
                <form action={async () => { "use server"; await reviewMoveOutFindings(moveOut.id); }}>
                  <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.moveOut.reviewFindingsButton}</button>
                </form>
                <form action={async () => { "use server"; await reopenMoveOutStage(moveOut.id); }}>
                  <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveOut.reopenButton}</button>
                </form>
              </>
            )}
            {canUpdate && moveOut.status === "READY_FOR_CLOSURE" && (
              <form action={async () => { "use server"; await reopenMoveOutStage(moveOut.id); }}>
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveOut.reopenButton}</button>
              </form>
            )}
            {canComplete && moveOut.status === "READY_FOR_CLOSURE" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                  {t.moveOut.completeButton}
                </summary>
                <div className="absolute z-10 end-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.moveOut.completionPreviewTitle}</h3>
                  <p className="text-xs text-slate-600">{t.moveOut.completionPreviewBody}</p>
                  <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">{t.moveOut.completionPreviewNotDeposit}</p>
                  {!completion.canComplete && (
                    <ul className="text-xs text-red-600 list-disc ps-4 space-y-0.5">
                      {completion.missing.map((m) => (
                        <li key={m}>{t.moveOutMissingRequirement[m]}</li>
                      ))}
                    </ul>
                  )}
                  <form action={async () => { "use server"; await completeMoveOut(moveOut.id); }}>
                    <button disabled={!completion.canComplete} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                      {t.moveOut.completionConfirmButton}
                    </button>
                  </form>
                </div>
              </details>
            )}
            {canCancel && !isTerminal && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.moveOut.cancelButton}</summary>
                <form action={cancelMoveOut} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <input type="hidden" name="moveOutId" value={moveOut.id} />
                  <h3 className="font-semibold text-slate-800 text-sm">{t.moveOut.cancelTitle}</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveOut.cancelReasonLabel}</label>
                    <select name="reason" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {(Object.keys(t.moveOutCancelReason) as MoveOutCancelReason[]).map((v) => (
                        <option key={v} value={v}>
                          {t.moveOutCancelReason[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveOut.cancelNoteLabel}</label>
                    <textarea name="note" rows={2} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.moveOut.confirmCancelButton}</button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>

      {moveOut.status === "COMPLETED" && <p className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">{t.moveOut.completedReadOnlyNotice}</p>}

      {!completion.canComplete && moveOut.status === "READY_FOR_CLOSURE" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <p className="font-medium mb-1">{t.moveOut.missingRequirementsTitle}</p>
          <ul className="list-disc ps-5 space-y-0.5">
            {completion.missing.map((m) => (
              <li key={m}>{t.moveOutMissingRequirement[m]}</li>
            ))}
          </ul>
        </div>
      )}

      {moveOut.status === "COMPLETED" && canViewSettlement && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">{t.securityDeposit.listTitle}</h2>
            {settlement ? (
              <p className="text-sm text-slate-500 mt-1">
                {settlement.settlementNumber} — {t.settlementStatus[settlement.status]}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-1">{t.securityDeposit.noSettlementYet}</p>
            )}
          </div>
          {settlement ? (
            <Link href={`/operations/settlements/${settlement.id}`} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
              {t.securityDeposit.viewSettlementButton}
            </Link>
          ) : (
            canCreateSettlement && (
              <form
                action={async () => {
                  "use server";
                  const settlementId = await createSecurityDepositSettlement(moveOut.id);
                  revalidatePath(`/operations/move-outs/${moveOut.id}`);
                  redirect(`/operations/settlements/${settlementId}`);
                }}
              >
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.securityDeposit.createSettlementButton}</button>
              </form>
            )
          )}
        </section>
      )}

      {/* Overview */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionSummary}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.moveOut.fieldContract}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            <Link href={`/contracts/${moveOut.contract.id}/edit`} className="text-brand-gold-dark hover:underline">
              {moveOut.contract.contractNumber}
            </Link>
          </dd>
          <dt className="text-slate-500">{t.moveOut.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            {moveOut.unit.unitNumber} — {unitLocationLabel(locale, moveOut.unit)}
          </dd>
          <dt className="text-slate-500">{t.moveOut.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">{pickLocalized(locale, moveOut.renter.fullNameAr, moveOut.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldInspector}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.inspectedByUser?.name ?? t.moveOut.notSet}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldStartedAt}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.startedAt ? dateTimeFmt.format(moveOut.startedAt) : t.moveOut.notSet}</dd>
        </dl>

        {canUpdate && (
          <form action={scheduleMoveOut} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveOut.scheduledAtLabel}</label>
              <input type="datetime-local" name="scheduledAt" defaultValue={fmtDateInput(moveOut.scheduledAt)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveOut.saveButton}</button>
          </form>
        )}

        {canUpdate && editable && (
          <form action={setVacateDate} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveOut.fieldVacateDate}</label>
              <input type="datetime-local" name="vacateDate" defaultValue={fmtDateInput(moveOut.vacateDate)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveOut.saveButton}</button>
          </form>
        )}
        {!editable && (
          <p className="mt-3 text-sm text-slate-600">
            {t.moveOut.fieldVacateDate}: {moveOut.vacateDate ? dateTimeFmt.format(moveOut.vacateDate) : t.moveOut.notSet}
          </p>
        )}
      </section>

      {/* Move-In baseline */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionMoveInBaseline}</h2>
        {baselineMoveIn ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.moveIn.fieldMoveInNumber}</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/operations/move-ins/${baselineMoveIn.id}`} className="text-brand-gold-dark hover:underline">
                {baselineMoveIn.moveInNumber}
              </Link>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{t.moveOut.noMoveInBaseline}</p>
        )}
      </section>

      {/* Findings summary */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionFindingsSummary}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat label={t.moveOut.findingsTotalItems} value={defects.totalItems} />
          <Stat label={t.moveOut.findingsRequiresAttention} value={defects.requiresAttentionCount} tone="text-amber-600" />
          <Stat label={t.moveOut.findingsDamaged} value={defects.damagedCount} tone="text-red-600" />
          <Stat label={t.moveOut.findingsNotWorking} value={defects.notWorkingCount} tone="text-red-600" />
          <Stat label={t.moveOut.findingsPoor} value={defects.poorCount} tone="text-amber-600" />
        </div>
        <p className="text-xs text-slate-400 mt-3">{t.moveOut.findingsNoticeNotLiability}</p>
      </section>

      {/* Findings review workspace - only shown at PENDING_FINDINGS_REVIEW */}
      {moveOut.status === "PENDING_FINDINGS_REVIEW" && (
        <section className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionFindingsReview}</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Field label={t.moveOut.findingsRequiresAttention} value={String(defects.requiresAttentionCount)} />
            <Field label={t.moveOut.findingsDamaged} value={String(defects.damagedCount)} />
            <Field label={t.moveOut.inventoryItemNameLabel + " (" + t.inventoryDiffStatus.QUANTITY_MISMATCH + ")"} value={String(inventoryDiff.filter((i) => i.status !== "MATCHED").length)} />
            <Field label={t.moveOut.keyDifferenceLabel} value={String(keyReconciliation.lines.filter((l) => !l.fullyReturned).length)} />
          </dl>
        </section>
      )}

      {/* Checklist with Move-In baseline comparison */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">{t.moveOut.sectionChecklist}</h2>
          <span className="text-sm text-slate-500">{t.moveOut.progressLabel(progress.completed, progress.total, progress.percent)}</span>
        </div>
        <div className="space-y-5">
          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.inspectionCategory[category]}</h3>
              <div className="space-y-2">
                {items.map((item) => {
                  const baselineCondition = item.moveInInspectionItem?.condition ?? null;
                  const comparison = computeConditionComparisonLabel(baselineCondition, item.condition);
                  return (
                    <div key={item.id} className="bg-slate-50 rounded-lg px-3 py-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className={`text-sm flex-1 min-w-[140px] font-medium ${!item.isApplicable ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {pickLocalized(locale, item.itemNameAr, item.itemName)}
                        </span>
                        <span>
                          {t.moveOut.moveInConditionLabel}: <strong>{baselineCondition ? t.conditionRating[baselineCondition] : "—"}</strong>
                        </span>
                        <span>
                          {t.moveOut.moveOutConditionLabel}: <strong>{item.condition ? t.conditionRating[item.condition] : "—"}</strong>
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full font-medium bg-white border border-slate-200">
                          {t.moveOut.conditionChangeLabel}: {t.conditionComparison[comparison]}
                        </span>
                        {item.requiresAttention && canCreateMaintenance && item.maintenanceRequests.length === 0 && (
                          <form action={createMaintenanceRequestFromFinding} className="no-print">
                            <input type="hidden" name="moveOutId" value={moveOut.id} />
                            <input type="hidden" name="inspectionItemId" value={item.id} />
                            <button className="text-brand-gold-dark hover:underline font-medium">{t.moveOut.createMaintenanceRequestButton}</button>
                          </form>
                        )}
                        {item.maintenanceRequests.length > 0 && (
                          <span className="text-sky-700">🛠️ {item.maintenanceRequests.map((r) => r.requestNumber).join(", ")}</span>
                        )}
                      </div>
                      <form action={updateInspectionItem} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="itemId" value={item.id} />
                        <select name="condition" defaultValue={item.condition ?? ""} disabled={!canInspect || !editable} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                          <option value="">—</option>
                          {(Object.keys(t.conditionRating) as ConditionRating[]).map((v) => (
                            <option key={v} value={v}>
                              {t.conditionRating[v]}
                            </option>
                          ))}
                        </select>
                        <input
                          name="notes"
                          defaultValue={item.notes ?? ""}
                          placeholder={t.moveOut.notesLabel}
                          disabled={!canInspect || !editable}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs w-40"
                        />
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" name="requiresAttention" defaultChecked={item.requiresAttention} disabled={!canInspect || !editable} className="rounded border-slate-300" />
                          {t.moveOut.requiresAttentionLabel}
                        </label>
                        {canInspect && editable && <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.moveOut.saveButton}</button>}
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Inventory comparison */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionInventory}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveOut.inventoryCategoryLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.inventoryMoveInQtyLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.inventoryMoveOutQtyLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.moveInConditionLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.moveOutConditionLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.conditionChangeLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryDiff.map((line, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">{t.inspectionCategory[line.category]}</td>
                  <td className="px-2 py-1.5">{line.itemName}</td>
                  <td className="px-2 py-1.5">{line.moveInQuantity ?? "—"}</td>
                  <td className="px-2 py-1.5">{line.moveOutQuantity ?? "—"}</td>
                  <td className="px-2 py-1.5">{line.moveInCondition ? t.conditionRating[line.moveInCondition] : "—"}</td>
                  <td className="px-2 py-1.5">{line.moveOutCondition ? t.conditionRating[line.moveOutCondition] : "—"}</td>
                  <td className="px-2 py-1.5">{t.inventoryDiffStatus[line.status]}</td>
                </tr>
              ))}
              {inventoryDiff.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    {t.moveOut.inventoryEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <form action={addInventoryItem} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <select name="category" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(Object.keys(t.inspectionCategory) as InspectionCategory[]).map((v) => (
                <option key={v} value={v}>
                  {t.inspectionCategory[v]}
                </option>
              ))}
            </select>
            <input name="itemName" required placeholder={t.moveOut.inventoryItemNameLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="quantity" type="number" min="1" defaultValue="1" placeholder={t.moveOut.inventoryQuantityLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <select name="condition" defaultValue="" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">{t.moveOut.inventoryConditionLabel}</option>
              {(Object.keys(t.conditionRating) as ConditionRating[]).map((v) => (
                <option key={v} value={v}>
                  {t.conditionRating[v]}
                </option>
              ))}
            </select>
            <input name="brand" placeholder={t.moveOut.inventoryBrandLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveOut.addInventoryButton}</button>
          </form>
        )}
      </section>

      {/* Meters */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionMeters}</h2>
        <p className="text-xs text-slate-400 mb-3">{t.moveOut.meterRequiredNotice}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveOut.meterTypeLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.meterMoveInReadingLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.meterMoveOutReadingLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.meterDifferenceLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meterConsumption.map((m, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">{t.meterType[m.meterType]}</td>
                  <td className="px-2 py-1.5 text-slate-500">{m.moveInReading ?? "—"}</td>
                  <td className="px-2 py-1.5">{m.moveOutReading ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">{m.consumption ?? "—"}</td>
                </tr>
              ))}
              {meterConsumption.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    {t.moveOut.meterEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <form action={addMeterReading} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <select name="meterType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(Object.keys(t.meterType) as MeterType[]).map((v) => (
                <option key={v} value={v}>
                  {t.meterType[v]}
                </option>
              ))}
            </select>
            <input name="meterNumber" placeholder={t.moveOut.meterNumberLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="reading" type="number" step="0.01" required placeholder={t.moveOut.meterReadingLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="unitOfMeasure" placeholder={t.moveOut.meterUnitOfMeasureLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveOut.addMeterButton}</button>
          </form>
        )}
      </section>

      {/* Keys */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionKeys}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveOut.keyTypeLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.keyDescriptionLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.keyIssuedLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.keyReturnedLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveOut.keyFullyReturnedLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keyReconciliation.lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">{t.keyType[line.keyType]}</td>
                  <td className="px-2 py-1.5">{line.description}</td>
                  <td className="px-2 py-1.5">{line.expectedQuantity}</td>
                  <td className="px-2 py-1.5">{line.returnedQuantity}</td>
                  <td className="px-2 py-1.5">{line.fullyReturned ? t.common.yes : t.common.no}</td>
                </tr>
              ))}
              {keyReconciliation.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                    {t.moveOut.keyEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <>
            <form action={addKeyItem} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end mb-3">
              <input type="hidden" name="moveOutId" value={moveOut.id} />
              <select name="keyType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {(Object.keys(t.keyType) as KeyType[]).map((v) => (
                  <option key={v} value={v}>
                    {t.keyType[v]}
                  </option>
                ))}
              </select>
              <input name="description" required placeholder={t.moveOut.keyDescriptionLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="quantity" type="number" min="1" defaultValue="1" placeholder={t.moveOut.keyQuantityLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="identifier" placeholder={t.moveOut.keyDescriptionLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveOut.addKeyButton}</button>
            </form>
            <form action={async () => { "use server"; await setNoKeysToReturn(moveOut.id, !moveOut.noKeysToReturn); }} className="flex items-center gap-2">
              <span className={`text-sm ${moveOut.noKeysToReturn ? "text-slate-800 font-medium" : "text-slate-500"}`}>
                {moveOut.noKeysToReturn ? "✓ " : ""}
                {t.moveOut.noKeysToReturnLabel}
              </span>
              <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.moveOut.saveButton}</button>
            </form>
          </>
        )}
      </section>

      {/* Maintenance requests */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionMaintenanceRequests}</h2>
        {moveOut.maintenanceRequests.length === 0 ? (
          <p className="text-sm text-slate-400">{t.moveOut.maintenanceEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-right">
                <tr>
                  <th className="px-2 py-1 font-medium">{t.moveOut.maintenanceColRequestNumber}</th>
                  <th className="px-2 py-1 font-medium">{t.moveOut.maintenanceColStatus}</th>
                  <th className="px-2 py-1 font-medium">{t.moveOut.maintenanceColPriority}</th>
                  <th className="px-2 py-1 font-medium">{t.moveOut.maintenanceColCategory}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moveOut.maintenanceRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5">
                      <Link href={`/operations/maintenance/requests/${r.id}`} className="text-brand-gold-dark hover:underline">
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">{t.maintenanceRequestStatus[r.status]}</td>
                    <td className="px-2 py-1.5">{t.maintenancePriority[r.priority]}</td>
                    <td className="px-2 py-1.5">{t.maintenanceCategory[r.category]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Attachments */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionAttachments}</h2>
        <p className="text-xs text-slate-400 mb-3">{t.moveOut.attachmentNote}</p>
        <ul className="text-sm space-y-1 mb-3">
          {moveOut.attachments.map((a) => (
            <li key={a.id} className="text-slate-600">
              📎 {a.fileName} {a.caption && `— ${a.caption}`}
            </li>
          ))}
          {moveOut.attachments.length === 0 && <li className="text-slate-400">{t.moveOut.attachmentEmpty}</li>}
        </ul>
        {canInspect && editable && (
          <form action={addAttachmentMetadata} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <select name="attachmentType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <option value="PHOTO">PHOTO</option>
              <option value="DOCUMENT">DOCUMENT</option>
              <option value="OTHER">OTHER</option>
            </select>
            <input name="fileName" required placeholder="file name" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="mimeType" required placeholder="image/jpeg" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="caption" placeholder={t.moveOut.notesLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium col-span-2 sm:col-span-1">{t.moveOut.addButton}</button>
          </form>
        )}
      </section>

      {/* Acknowledgement */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">{t.moveOut.sectionAcknowledgement}</h2>
        <p className="text-xs text-slate-400">{t.moveOut.acknowledgementDisclaimer}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-500">{t.moveOut.tenantAcknowledgedAtLabel}</p>
            <p className="font-medium text-slate-800">{moveOut.tenantAcknowledgedAt ? dateTimeFmt.format(moveOut.tenantAcknowledgedAt) : t.moveOut.notSet}</p>
            {moveOut.tenantRepresentativeName && <p className="text-xs text-slate-500">{moveOut.tenantRepresentativeName}</p>}
          </div>
          <div>
            <p className="text-sm text-slate-500">{t.moveOut.staffAcknowledgedAtLabel}</p>
            <p className="font-medium text-slate-800">{moveOut.staffAcknowledgedAt ? dateTimeFmt.format(moveOut.staffAcknowledgedAt) : t.moveOut.notSet}</p>
            {moveOut.handedOverByUser && <p className="text-xs text-slate-500">{moveOut.handedOverByUser.name}</p>}
          </div>
        </div>

        {canUpdate && editable && !moveOut.tenantAcknowledgedAt && (
          <form action={recordTenantAcknowledgement} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-t border-slate-100 pt-4">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <input name="tenantRepresentativeName" required placeholder={t.moveOut.tenantRepresentativeNameLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <input name="tenantRepresentativeId" placeholder={t.moveOut.tenantRepresentativeIdLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveOut.recordTenantAcknowledgementButton}</button>
          </form>
        )}

        {canComplete && editable && !moveOut.tenantAcknowledgedAt && (
          <form action={setTenantAcknowledgementOverride} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <input type="hidden" name="moveOutId" value={moveOut.id} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="override" defaultChecked={moveOut.tenantAcknowledgementOverride} className="rounded border-slate-300" />
              {t.moveOut.overrideLabel}
            </label>
            <input name="reason" defaultValue={moveOut.tenantAcknowledgementOverrideReason ?? ""} placeholder={t.moveOut.overrideReasonLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveOut.saveOverrideButton}</button>
          </form>
        )}

        {canUpdate && editable && !moveOut.staffAcknowledgedAt && (
          <form action={async () => { "use server"; await recordStaffAcknowledgement(moveOut.id); }}>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-1.5 text-sm font-medium">{t.moveOut.recordStaffAcknowledgementButton}</button>
          </form>
        )}
      </section>

      <AuditTimeline entityType="MoveOut" entityId={moveOut.id} />

      <div className="no-print">
        <Link href={`/operations/move-outs/${moveOut.id}/report`} className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.moveOut.reportTitle} →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
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
