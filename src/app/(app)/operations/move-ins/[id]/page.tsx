import Link from "next/link";
import {
  getMoveInById,
  scheduleMoveIn,
  startMoveIn,
  updateInspectionItem,
  addInventoryItem,
  addMeterReading,
  addKeyItem,
  setNoKeysToRecord,
  addAttachmentMetadata,
  updateReadinessFlags,
  recordTenantAcknowledgement,
  setTenantAcknowledgementOverride,
  recordStaffAcknowledgement,
  markReadyForHandover,
  completeMoveIn,
  cancelMoveIn,
  setHandoverDate,
} from "@/lib/actions/move-ins";
import { getMoveOutForContract } from "@/lib/actions/move-outs";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";
import type { InspectionCategory, ConditionRating, MeterType, KeyType, MoveInCancelReason } from "@prisma/client";

function fmtDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 16);
}

export default async function MoveInProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ moveIn, progress, defects, overdue, readyEligible, completion }, role, locale] = await Promise.all([
    getMoveInById(id),
    getCurrentUserRole(),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canUpdate = can("moveIn.update", role);
  const canStart = can("moveIn.start", role);
  const canComplete = can("moveIn.complete", role);
  const canCancel = can("moveIn.cancel", role);
  const canInspect = can("moveInInspection.update", role);
  const canViewMoveOuts = can("moveOut.view", role);
  const relatedMoveOut = canViewMoveOuts ? await getMoveOutForContract(moveIn.contract.id) : null;
  const editable = moveIn.status === "IN_PROGRESS" || moveIn.status === "READY_FOR_HANDOVER";

  const itemsByCategory = new Map<InspectionCategory, typeof moveIn.inspectionItems>();
  for (const item of moveIn.inspectionItems) {
    const arr = itemsByCategory.get(item.category) ?? [];
    arr.push(item);
    itemsByCategory.set(item.category, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/move-ins" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.moveIn.listTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{moveIn.moveInNumber}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {t.moveInStatus[moveIn.status]}
              {overdue && <span className="ms-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t.moveIn.filterOverdue}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStart && moveIn.status === "DRAFT" && (
              <form action={async () => { "use server"; await startMoveIn(moveIn.id); }}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.moveIn.startButton}</button>
              </form>
            )}
            {canStart && moveIn.status === "SCHEDULED" && (
              <form action={async () => { "use server"; await startMoveIn(moveIn.id); }}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.moveIn.startButton}</button>
              </form>
            )}
            {canUpdate && moveIn.status === "IN_PROGRESS" && (
              <form action={async () => { "use server"; await markReadyForHandover(moveIn.id); }}>
                <button disabled={!readyEligible} className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                  {t.moveIn.markReadyButton}
                </button>
              </form>
            )}
            {canComplete && (moveIn.status === "READY_FOR_HANDOVER" || moveIn.status === "IN_PROGRESS") && (
              <form action={async () => { "use server"; await completeMoveIn(moveIn.id); }}>
                <button disabled={!completion.canComplete} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                  {t.moveIn.completeButton}
                </button>
              </form>
            )}
            {canCancel && moveIn.status !== "COMPLETED" && moveIn.status !== "CANCELLED" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.moveIn.cancelButton}</summary>
                <form action={cancelMoveIn} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <input type="hidden" name="moveInId" value={moveIn.id} />
                  <h3 className="font-semibold text-slate-800 text-sm">{t.moveIn.cancelTitle}</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveIn.cancelReasonLabel}</label>
                    <select name="reason" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {(Object.keys(t.moveInCancelReason) as MoveInCancelReason[]).map((v) => (
                        <option key={v} value={v}>
                          {t.moveInCancelReason[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveIn.cancelNoteLabel}</label>
                    <textarea name="note" rows={2} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.moveIn.confirmCancelButton}</button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>

      {!completion.canComplete && moveIn.status !== "COMPLETED" && moveIn.status !== "CANCELLED" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <p className="font-medium mb-1">{t.moveIn.missingRequirementsTitle}</p>
          <ul className="list-disc ps-5 space-y-0.5">
            {completion.missing.map((m) => (
              <li key={m}>{t.missingRequirement[m]}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Overview */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionOverview}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.moveIn.fieldContract}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            <Link href={`/contracts/${moveIn.contract.id}/edit`} className="text-brand-gold-dark hover:underline">
              {moveIn.contract.contractNumber}
            </Link>
          </dd>
          <dt className="text-slate-500">{t.moveIn.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">
            {moveIn.unit.unitNumber} — {unitLocationLabel(locale, moveIn.unit)}
          </dd>
          <dt className="text-slate-500">{t.moveIn.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium sm:col-span-1 lg:col-span-2">{pickLocalized(locale, moveIn.renter.fullNameAr, moveIn.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldInspector}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.inspectedByUser?.name ?? t.moveIn.notSet}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldStartedAt}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.startedAt ? dateTimeFmt.format(moveIn.startedAt) : t.moveIn.notSet}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldIsFurnished}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.isFurnished ? t.common.yes : t.common.no}</dd>
        </dl>

        {canUpdate && (
          <form action={scheduleMoveIn} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveIn.scheduledAtLabel}</label>
              <input type="datetime-local" name="scheduledAt" defaultValue={fmtDateInput(moveIn.scheduledAt)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveIn.saveButton}</button>
          </form>
        )}

        {canUpdate && editable && (
          <form action={setHandoverDate} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.moveIn.fieldHandoverDate}</label>
              <input type="datetime-local" name="handoverDate" defaultValue={fmtDateInput(moveIn.handoverDate)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveIn.saveButton}</button>
          </form>
        )}
        {!editable && (
          <p className="mt-3 text-sm text-slate-600">
            {t.moveIn.fieldHandoverDate}: {moveIn.handoverDate ? dateTimeFmt.format(moveIn.handoverDate) : t.moveIn.notSet}
          </p>
        )}
      </section>

      {canViewMoveOuts && relatedMoveOut && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionSummary}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.moveOut.fieldMoveOutNumber}</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/operations/move-outs/${relatedMoveOut.id}`} className="text-brand-gold-dark hover:underline">
                {relatedMoveOut.moveOutNumber}
              </Link>
            </dd>
            <dt className="text-slate-500">{t.moveOut.contractStatusLabel}</dt>
            <dd className="text-slate-800 font-medium">{t.moveOutStatus[relatedMoveOut.status]}</dd>
          </dl>
        </section>
      )}

      {/* Defect summary */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.defectSummaryTitle}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat label={t.moveIn.defectTotalItems} value={defects.totalItems} />
          <Stat label={t.moveIn.defectRequiresAttention} value={defects.requiresAttentionCount} tone="text-amber-600" />
          <Stat label={t.moveIn.defectDamaged} value={defects.damagedCount} tone="text-red-600" />
          <Stat label={t.moveIn.defectNotWorking} value={defects.notWorkingCount} tone="text-red-600" />
          <Stat label={t.moveIn.defectPoor} value={defects.poorCount} tone="text-amber-600" />
        </div>
        <p className="text-xs text-slate-400 mt-3">{t.moveIn.defectNoticeNotBlocking}</p>
      </section>

      {/* Checklist */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">{t.moveIn.sectionChecklist}</h2>
          <span className="text-sm text-slate-500">{t.moveIn.progressLabel(progress.completed, progress.total, progress.percent)}</span>
        </div>
        <div className="space-y-5">
          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.inspectionCategory[category]}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <form key={item.id} action={updateInspectionItem} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <input type="hidden" name="itemId" value={item.id} />
                    <span className={`text-sm flex-1 min-w-[140px] ${!item.isApplicable ? "text-slate-400 line-through" : "text-slate-700"}`}>
                      {pickLocalized(locale, item.itemNameAr, item.itemName)}
                    </span>
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
                      placeholder={t.moveIn.notesLabel}
                      disabled={!canInspect || !editable}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs w-40"
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" name="requiresAttention" defaultChecked={item.requiresAttention} disabled={!canInspect || !editable} className="rounded border-slate-300" />
                      {t.moveIn.requiresAttentionLabel}
                    </label>
                    {canInspect && editable && (
                      <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.moveIn.saveButton}</button>
                    )}
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Inventory */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionInventory}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveIn.inventoryCategoryLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.inventoryItemNameLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.inventoryQuantityLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.inventoryConditionLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.inventoryBrandLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moveIn.inventoryItems.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-2 py-1.5">{t.inspectionCategory[inv.category]}</td>
                  <td className="px-2 py-1.5">{inv.itemName}</td>
                  <td className="px-2 py-1.5">{inv.quantity}</td>
                  <td className="px-2 py-1.5">{inv.condition ? t.conditionRating[inv.condition] : "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">{inv.brand ?? "—"}</td>
                </tr>
              ))}
              {moveIn.inventoryItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                    {t.moveIn.inventoryEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <form action={addInventoryItem} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <select name="category" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(Object.keys(t.inspectionCategory) as InspectionCategory[]).map((v) => (
                <option key={v} value={v}>
                  {t.inspectionCategory[v]}
                </option>
              ))}
            </select>
            <input name="itemName" required placeholder={t.moveIn.inventoryItemNameLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="quantity" type="number" min="1" defaultValue="1" placeholder={t.moveIn.inventoryQuantityLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <select name="condition" defaultValue="" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">{t.moveIn.inventoryConditionLabel}</option>
              {(Object.keys(t.conditionRating) as ConditionRating[]).map((v) => (
                <option key={v} value={v}>
                  {t.conditionRating[v]}
                </option>
              ))}
            </select>
            <input name="brand" placeholder={t.moveIn.inventoryBrandLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveIn.addInventoryButton}</button>
          </form>
        )}
      </section>

      {/* Meters */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionMeters}</h2>
        <p className="text-xs text-slate-400 mb-3">{t.moveIn.meterRequiredNotice}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveIn.meterTypeLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.meterNumberLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.meterReadingLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.meterUnitOfMeasureLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moveIn.meterReadings.map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-1.5">{t.meterType[m.meterType]}</td>
                  <td className="px-2 py-1.5 text-slate-500">{m.meterNumber ?? "—"}</td>
                  <td className="px-2 py-1.5">{String(m.reading)}</td>
                  <td className="px-2 py-1.5 text-slate-500">{m.unitOfMeasure ?? "—"}</td>
                </tr>
              ))}
              {moveIn.meterReadings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    {t.moveIn.meterEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <form action={addMeterReading} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <select name="meterType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(Object.keys(t.meterType) as MeterType[]).map((v) => (
                <option key={v} value={v}>
                  {t.meterType[v]}
                </option>
              ))}
            </select>
            <input name="meterNumber" placeholder={t.moveIn.meterNumberLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="reading" type="number" step="0.01" required placeholder={t.moveIn.meterReadingLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="unitOfMeasure" placeholder={t.moveIn.meterUnitOfMeasureLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveIn.addMeterButton}</button>
          </form>
        )}
      </section>

      {/* Keys */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionKeys}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-right">
              <tr>
                <th className="px-2 py-1 font-medium">{t.moveIn.keyTypeLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.keyDescriptionLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.keyQuantityLabel}</th>
                <th className="px-2 py-1 font-medium">{t.moveIn.keyReturnedExpectedLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moveIn.keyItems.map((k) => (
                <tr key={k.id}>
                  <td className="px-2 py-1.5">{t.keyType[k.keyType]}</td>
                  <td className="px-2 py-1.5">{k.description}</td>
                  <td className="px-2 py-1.5">{k.quantity}</td>
                  <td className="px-2 py-1.5 text-slate-500">{k.returnedExpected ? t.common.yes : t.common.no}</td>
                </tr>
              ))}
              {moveIn.keyItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    {t.moveIn.keyEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canInspect && editable && (
          <>
            <form action={addKeyItem} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end mb-3">
              <input type="hidden" name="moveInId" value={moveIn.id} />
              <select name="keyType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {(Object.keys(t.keyType) as KeyType[]).map((v) => (
                  <option key={v} value={v}>
                    {t.keyType[v]}
                  </option>
                ))}
              </select>
              <input name="description" required placeholder={t.moveIn.keyDescriptionLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="quantity" type="number" min="1" defaultValue="1" placeholder={t.moveIn.keyQuantityLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" name="returnedExpected" defaultChecked className="rounded border-slate-300" />
                {t.moveIn.keyReturnedExpectedLabel}
              </label>
              <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveIn.addKeyButton}</button>
            </form>
            <form action={async () => { "use server"; await setNoKeysToRecord(moveIn.id, !moveIn.noKeysToRecord); }} className="flex items-center gap-2">
              <span className={`text-sm ${moveIn.noKeysToRecord ? "text-slate-800 font-medium" : "text-slate-500"}`}>
                {moveIn.noKeysToRecord ? "✓ " : ""}
                {t.moveIn.noKeysToRecordLabel}
              </span>
              <button className="text-xs text-brand-gold-dark hover:underline font-medium">{t.moveIn.saveButton}</button>
            </form>
          </>
        )}
      </section>

      {/* Attachments */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionAttachments}</h2>
        <p className="text-xs text-slate-400 mb-3">{t.moveIn.attachmentNote}</p>
        <ul className="text-sm space-y-1 mb-3">
          {moveIn.attachments.map((a) => (
            <li key={a.id} className="text-slate-600">
              📎 {a.fileName} {a.caption && `— ${a.caption}`}
            </li>
          ))}
          {moveIn.attachments.length === 0 && <li className="text-slate-400">{t.moveIn.attachmentEmpty}</li>}
        </ul>
        {canInspect && editable && (
          <form action={addAttachmentMetadata} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <select name="attachmentType" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <option value="PHOTO">PHOTO</option>
              <option value="DOCUMENT">DOCUMENT</option>
              <option value="OTHER">OTHER</option>
            </select>
            <input name="fileName" required placeholder="file name" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="mimeType" required placeholder="image/jpeg" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="caption" placeholder={t.moveIn.notesLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium col-span-2 sm:col-span-1">{t.moveIn.addButton}</button>
          </form>
        )}
      </section>

      {/* Readiness */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionReadiness}</h2>
        <form action={updateReadinessFlags} className="flex flex-wrap gap-4">
          <input type="hidden" name="moveInId" value={moveIn.id} />
          {(
            [
              ["utilitiesReady", t.moveIn.utilitiesReadyLabel, moveIn.utilitiesReady],
              ["keysReady", t.moveIn.keysReadyLabel, moveIn.keysReady],
              ["cleaningComplete", t.moveIn.cleaningCompleteLabel, moveIn.cleaningComplete],
              ["unitReady", t.moveIn.unitReadyLabel, moveIn.unitReady],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name} className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name={name} defaultChecked={checked} disabled={!canUpdate || !editable} className="rounded border-slate-300" />
              {label}
            </label>
          ))}
          {canUpdate && editable && <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-1.5 text-sm font-medium">{t.moveIn.saveReadinessButton}</button>}
        </form>
      </section>

      {/* Acknowledgement */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">{t.moveIn.sectionAcknowledgement}</h2>
        <p className="text-xs text-slate-400">{t.moveIn.acknowledgementDisclaimer}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-500">{t.moveIn.tenantAcknowledgedAtLabel}</p>
            <p className="font-medium text-slate-800">{moveIn.tenantAcknowledgedAt ? dateTimeFmt.format(moveIn.tenantAcknowledgedAt) : t.moveIn.notSet}</p>
            {moveIn.tenantRepresentativeName && <p className="text-xs text-slate-500">{moveIn.tenantRepresentativeName}</p>}
          </div>
          <div>
            <p className="text-sm text-slate-500">{t.moveIn.staffAcknowledgedAtLabel}</p>
            <p className="font-medium text-slate-800">{moveIn.staffAcknowledgedAt ? dateTimeFmt.format(moveIn.staffAcknowledgedAt) : t.moveIn.notSet}</p>
            {moveIn.handedOverByUser && <p className="text-xs text-slate-500">{moveIn.handedOverByUser.name}</p>}
          </div>
        </div>

        {canUpdate && editable && !moveIn.tenantAcknowledgedAt && (
          <form action={recordTenantAcknowledgement} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-t border-slate-100 pt-4">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <input name="tenantRepresentativeName" required placeholder={t.moveIn.tenantRepresentativeNameLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <input name="tenantRepresentativeId" placeholder={t.moveIn.tenantRepresentativeIdLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveIn.recordTenantAcknowledgementButton}</button>
          </form>
        )}

        {canComplete && editable && !moveIn.tenantAcknowledgedAt && (
          <form action={setTenantAcknowledgementOverride} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <input type="hidden" name="moveInId" value={moveIn.id} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="override" defaultChecked={moveIn.tenantAcknowledgementOverride} className="rounded border-slate-300" />
              {t.moveIn.overrideLabel}
            </label>
            <input name="reason" defaultValue={moveIn.tenantAcknowledgementOverrideReason ?? ""} placeholder={t.moveIn.overrideReasonLabel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium">{t.moveIn.saveOverrideButton}</button>
          </form>
        )}

        {canUpdate && editable && !moveIn.staffAcknowledgedAt && (
          <form action={async () => { "use server"; await recordStaffAcknowledgement(moveIn.id); }}>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-1.5 text-sm font-medium">{t.moveIn.recordStaffAcknowledgementButton}</button>
          </form>
        )}
      </section>

      <AuditTimeline entityType="MoveIn" entityId={moveIn.id} />

      <div className="no-print">
        <Link href={`/operations/move-ins/${moveIn.id}/report`} className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.moveIn.reportTitle} →
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
