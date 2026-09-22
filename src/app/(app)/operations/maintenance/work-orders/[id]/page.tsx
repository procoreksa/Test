import Link from "next/link";
import {
  getMaintenanceWorkOrderById,
  assignWorkOrder,
  scheduleWorkOrder,
  startWorkOrder,
  holdWorkOrder,
  resumeWorkOrder,
  diagnoseWorkOrder,
  addWorkLog,
  addLaborEntry,
  addPartEntry,
  addCostEntry,
  completeWorkOrder,
  verifyWorkOrder,
  closeWorkOrder,
  cancelWorkOrder,
  setWorkOrderCostResponsibility,
  listAssignableUsers,
} from "@/lib/actions/maintenance";
import { listVendors } from "@/lib/actions/maintenance";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, currencyFormatter } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";
import { StatusBadge, PriorityBadge } from "../../requests/page";
import type { MaintenanceHoldReason, MaintenanceCostResponsibility, MaintenanceCancelReason, MaintenanceWorkLogType, MaintenanceCostEntryType } from "@prisma/client";

function fmtDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 16);
}

export default async function MaintenanceWorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [wo, role, locale, users, vendorsResult] = await Promise.all([
    getMaintenanceWorkOrderById(id),
    getCurrentUserRole(),
    getLocale(),
    listAssignableUsers(),
    listVendors({ activeOnly: true }),
  ]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);
  const moneyFmt = currencyFormatter(locale);
  const vendors = vendorsResult.rows;

  const canAssign = can("maintenance.workOrder.assign", role);
  const canUpdate = can("maintenance.workOrder.update", role);
  const canStart = can("maintenance.workOrder.start", role);
  const canComplete = can("maintenance.workOrder.complete", role);
  const canVerify = can("maintenance.workOrder.verify", role);
  const canClose = can("maintenance.workOrder.close", role);
  const canCancel = can("maintenance.workOrder.cancel", role);
  const canManageCost = can("maintenance.cost.manage", role);
  const locked = wo.status === "CLOSED";

  async function assign(formData: FormData) {
    "use server";
    await assignWorkOrder(id, formData);
  }
  async function schedule(formData: FormData) {
    "use server";
    await scheduleWorkOrder(id, formData);
  }
  async function start() {
    "use server";
    await startWorkOrder(id);
  }
  async function hold(formData: FormData) {
    "use server";
    await holdWorkOrder(id, formData);
  }
  async function resume() {
    "use server";
    await resumeWorkOrder(id);
  }
  async function diagnose(formData: FormData) {
    "use server";
    await diagnoseWorkOrder(id, formData);
  }
  async function workLog(formData: FormData) {
    "use server";
    await addWorkLog(id, formData);
  }
  async function labor(formData: FormData) {
    "use server";
    await addLaborEntry(id, formData);
  }
  async function part(formData: FormData) {
    "use server";
    await addPartEntry(id, formData);
  }
  async function cost(formData: FormData) {
    "use server";
    await addCostEntry(id, formData);
  }
  async function complete(formData: FormData) {
    "use server";
    await completeWorkOrder(id, formData);
  }
  async function verify(formData: FormData) {
    "use server";
    await verifyWorkOrder(id, formData);
  }
  async function close() {
    "use server";
    await closeWorkOrder(id);
  }
  async function cancel(formData: FormData) {
    "use server";
    await cancelWorkOrder(id, formData);
  }
  async function saveCostResponsibility(formData: FormData) {
    "use server";
    await setWorkOrderCostResponsibility(id, formData.get("costResponsibility") as MaintenanceCostResponsibility);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/maintenance/work-orders" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.workOrdersListTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{wo.workOrderNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={wo.status} label={t.maintenanceWorkOrderStatus[wo.status]} />
              <PriorityBadge priority={wo.priority} label={t.maintenancePriority[wo.priority]} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/operations/maintenance/work-orders/${id}/report`} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
              {t.maintenance.reportTitle}
            </Link>
            {canStart && (wo.status === "ASSIGNED" || wo.status === "SCHEDULED") && (
              <form action={start}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.startButton}</button>
              </form>
            )}
            {canUpdate && wo.status === "IN_PROGRESS" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.holdButton}</summary>
                <form action={hold} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <select name="holdReason" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(["WAITING_FOR_PART", "WAITING_FOR_VENDOR", "WAITING_FOR_TENANT", "WAITING_FOR_APPROVAL", "ACCESS_UNAVAILABLE", "OTHER"] as MaintenanceHoldReason[]).map((v) => (
                      <option key={v} value={v}>
                        {t.maintenanceHoldReason[v]}
                      </option>
                    ))}
                  </select>
                  <textarea name="holdReasonNote" rows={2} placeholder={t.maintenance.fieldHoldNote} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.holdButton}</button>
                </form>
              </details>
            )}
            {canUpdate && wo.status === "ON_HOLD" && (
              <form action={resume}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.resumeButton}</button>
              </form>
            )}
            {canVerify && wo.status === "COMPLETED" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.verifyButton}</summary>
                <form action={verify} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <textarea name="verificationNotes" rows={2} placeholder={t.maintenance.fieldVerificationNotes} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.verifyButton}</button>
                </form>
              </details>
            )}
            {canClose && wo.status === "VERIFIED" && (
              <form action={close}>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.closeButton}</button>
              </form>
            )}
            {canCancel && wo.status !== "CLOSED" && wo.status !== "CANCELLED" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.cancelButton}</summary>
                <form action={cancel} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.maintenance.cancelWorkOrderTitle}</h3>
                  <select name="cancelReason" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(["DUPLICATE", "NOT_NEEDED", "TENANT_WITHDREW", "RESOLVED_INFORMALLY", "DATA_ERROR", "OTHER"] as MaintenanceCancelReason[]).map((v) => (
                      <option key={v} value={v}>
                        {t.maintenanceCancelReason[v]}
                      </option>
                    ))}
                  </select>
                  <textarea name="cancelReasonNote" rows={2} placeholder={t.maintenance.cancelNoteLabel} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.confirmCancelButton}</button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title={t.maintenance.colRequest}>
            <Link href={`/operations/maintenance/requests/${wo.request.id}`} className="text-brand-gold-dark hover:underline text-sm">
              {wo.request.requestNumber} — {wo.request.title}
            </Link>
          </Section>

          {!locked && canUpdate && (
            <Section title={t.maintenance.sectionDiagnosis}>
              <form action={diagnose} className="space-y-3">
                <textarea name="diagnosis" rows={3} defaultValue={wo.diagnosis ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.diagnoseButton}</button>
              </form>
            </Section>
          )}
          {locked && wo.diagnosis && (
            <Section title={t.maintenance.sectionDiagnosis}>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{wo.diagnosis}</p>
            </Section>
          )}

          <Section title={t.maintenance.sectionWorkLogs}>
            <ul className="space-y-2 mb-4">
              {wo.workLogs.map((log) => (
                <li key={log.id} className="text-sm border-b border-slate-100 pb-2">
                  <span className="text-slate-400 text-xs me-2">{dateTimeFmt.format(log.createdAt)}</span>
                  <span className="font-medium text-slate-600 me-2">{t.maintenanceWorkLogType[log.logType]}</span>
                  <span className="text-slate-700">{log.note}</span>
                </li>
              ))}
              {wo.workLogs.length === 0 && <li className="text-sm text-slate-400">{t.maintenance.workLogEmpty}</li>}
            </ul>
            {!locked && canUpdate && (
              <form action={workLog} className="flex flex-wrap gap-2">
                <select name="logType" defaultValue="NOTE" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {(["NOTE", "STATUS_UPDATE", "DIAGNOSIS", "WORK_PERFORMED", "CUSTOMER_UPDATE", "INTERNAL_NOTE", "OTHER"] as MaintenanceWorkLogType[]).map((v) => (
                    <option key={v} value={v}>
                      {t.maintenanceWorkLogType[v]}
                    </option>
                  ))}
                </select>
                <input name="note" required placeholder={t.maintenance.workLogNoteLabel} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">{t.maintenance.addWorkLogButton}</button>
              </form>
            )}
          </Section>

          <Section title={t.maintenance.sectionLabor}>
            <ul className="space-y-2 mb-4">
              {wo.laborEntries.map((l) => (
                <li key={l.id} className="text-sm border-b border-slate-100 pb-2 flex justify-between">
                  <span>
                    {l.description} — {Number(l.hours)}h
                  </span>
                  <span className="font-medium">{moneyFmt.format(Number(l.cost))}</span>
                </li>
              ))}
              {wo.laborEntries.length === 0 && <li className="text-sm text-slate-400">{t.maintenance.laborEmpty}</li>}
            </ul>
            {!locked && canManageCost && (
              <form action={labor} className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <input name="description" required placeholder={t.maintenance.laborDescriptionLabel} className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" step="0.01" name="hours" required placeholder={t.maintenance.laborHoursLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" step="0.01" name="hourlyRate" placeholder={t.maintenance.laborRateLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="date" name="workDate" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button className="col-span-2 md:col-span-5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">{t.maintenance.addLaborButton}</button>
              </form>
            )}
          </Section>

          <Section title={t.maintenance.sectionParts}>
            <ul className="space-y-2 mb-4">
              {wo.partEntries.map((p) => (
                <li key={p.id} className="text-sm border-b border-slate-100 pb-2 flex justify-between">
                  <span>
                    {p.itemName} × {p.quantity}
                  </span>
                  <span className="font-medium">{moneyFmt.format(Number(p.totalCost))}</span>
                </li>
              ))}
              {wo.partEntries.length === 0 && <li className="text-sm text-slate-400">{t.maintenance.partEmpty}</li>}
            </ul>
            {!locked && canManageCost && (
              <form action={part} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input name="itemName" required placeholder={t.maintenance.partItemNameLabel} className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" name="quantity" required min="1" placeholder={t.maintenance.partQuantityLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" step="0.01" name="unitCost" required placeholder={t.maintenance.partUnitCostLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button className="col-span-2 md:col-span-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">{t.maintenance.addPartButton}</button>
              </form>
            )}
          </Section>

          <Section title={t.maintenance.sectionOtherCosts}>
            <ul className="space-y-2 mb-4">
              {wo.costEntries.map((c) => (
                <li key={c.id} className="text-sm border-b border-slate-100 pb-2 flex justify-between">
                  <span>{c.description}</span>
                  <span className="font-medium">{moneyFmt.format(Number(c.amount))}</span>
                </li>
              ))}
              {wo.costEntries.length === 0 && <li className="text-sm text-slate-400">{t.maintenance.costEmpty}</li>}
            </ul>
            {!locked && canManageCost && (
              <form action={cost} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <select name="costType" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {(["TRANSPORT", "EXTERNAL_SERVICE", "EQUIPMENT_RENTAL", "MISCELLANEOUS", "OTHER"] as MaintenanceCostEntryType[]).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <input name="description" required placeholder={t.maintenance.costDescriptionLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" step="0.01" name="amount" required placeholder={t.maintenance.costAmountLabel} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="date" name="date" required className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button className="col-span-2 md:col-span-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">{t.maintenance.addCostButton}</button>
              </form>
            )}
          </Section>

          {!locked && canComplete && wo.status === "IN_PROGRESS" && (
            <Section title={t.maintenance.sectionCompletion}>
              <form action={complete} className="space-y-3">
                <textarea name="workPerformed" rows={2} required placeholder={t.maintenance.fieldWorkPerformed} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <textarea name="completionNotes" rows={2} required placeholder={t.maintenance.fieldCompletionNotes} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="requiresFollowUp" className="rounded border-slate-300" />
                  {t.maintenance.fieldRequiresFollowUp}
                </label>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.completeButton}</button>
              </form>
            </Section>
          )}
          {wo.status !== "IN_PROGRESS" && wo.workPerformed && (
            <Section title={t.maintenance.sectionCompletion}>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Field label={t.maintenance.fieldWorkPerformed} value={wo.workPerformed} />
                <Field label={t.maintenance.fieldCompletionNotes} value={wo.completionNotes ?? "—"} />
              </dl>
            </Section>
          )}

          {(wo.verifiedAt || wo.status === "VERIFIED" || wo.status === "CLOSED") && (
            <Section title={t.maintenance.sectionVerification}>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Field label="—" value={wo.verifiedAt ? dateTimeFmt.format(wo.verifiedAt) : "—"} />
                <Field label={t.maintenance.fieldVerificationNotes} value={wo.verificationNotes ?? "—"} />
              </dl>
            </Section>
          )}

          <Section title={t.maintenance.sectionAudit}>
            <AuditTimeline entityType="MaintenanceWorkOrder" entityId={wo.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t.maintenance.sectionAssignment}>
            {!locked && canAssign ? (
              <form action={assign} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldAssignedUser}</label>
                  <select name="assignedToUserId" defaultValue={wo.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-400 text-center">{t.maintenance.filterVendor}</p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldVendor}</label>
                  <select name="vendorId" defaultValue={wo.vendorId ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.assignButton}</button>
              </form>
            ) : (
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Field label={t.maintenance.fieldAssignedUser} value={wo.assignedToUser?.name ?? wo.vendor?.name ?? t.maintenance.notSet} />
              </dl>
            )}
          </Section>

          <Section title={t.maintenance.sectionSchedule}>
            {!locked && canUpdate ? (
              <form action={schedule} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldScheduledStart}</label>
                  <input type="datetime-local" name="scheduledStart" defaultValue={fmtDateInput(wo.scheduledStart)} required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldScheduledEnd}</label>
                  <input type="datetime-local" name="scheduledEnd" defaultValue={fmtDateInput(wo.scheduledEnd)} required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.scheduleButton}</button>
              </form>
            ) : (
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Field label={t.maintenance.fieldScheduledStart} value={wo.scheduledStart ? dateTimeFmt.format(wo.scheduledStart) : t.maintenance.notSet} />
                <Field label={t.maintenance.fieldScheduledEnd} value={wo.scheduledEnd ? dateTimeFmt.format(wo.scheduledEnd) : t.maintenance.notSet} />
              </dl>
            )}
          </Section>

          <Section title={t.maintenance.sectionCostSummary}>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Field label={t.maintenance.costLaborTotal} value={moneyFmt.format(Number(wo.costSummary.laborCost))} />
              <Field label={t.maintenance.costPartsTotal} value={moneyFmt.format(Number(wo.costSummary.partsCost))} />
              <Field label={t.maintenance.costOtherTotal} value={moneyFmt.format(Number(wo.costSummary.otherCost))} />
              <Field label={t.maintenance.costActualTotal} value={moneyFmt.format(Number(wo.costSummary.actualCost))} />
              {wo.estimatedCost && <Field label={t.maintenance.costEstimatedLabel} value={moneyFmt.format(Number(wo.estimatedCost))} />}
              {wo.costVariance && <Field label={t.maintenance.costVarianceLabel} value={moneyFmt.format(Number(wo.costVariance))} />}
            </dl>
            <p className="text-xs text-slate-400 mt-3">{t.maintenance.costOperationalNotice}</p>
            {!locked && canManageCost && (
              <form action={saveCostResponsibility} className="mt-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldCostResponsibility}</label>
                <select name="costResponsibility" defaultValue={wo.costResponsibility} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm mb-2">
                  {(["UNDETERMINED", "OWNER", "TENANT", "PROPERTY_MANAGEMENT", "WARRANTY", "VENDOR", "OTHER"] as MaintenanceCostResponsibility[]).map((v) => (
                    <option key={v} value={v}>
                      {t.maintenanceCostResponsibility[v]}
                    </option>
                  ))}
                </select>
                <button className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-semibold">{t.maintenance.saveButton}</button>
              </form>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value}</dd>
    </div>
  );
}
