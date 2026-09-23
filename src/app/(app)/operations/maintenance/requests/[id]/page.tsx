import Link from "next/link";
import { getMaintenanceRequestById, triageMaintenanceRequest, cancelMaintenanceRequest, createWorkOrderFromRequest, listAssignableUsers } from "@/lib/actions/maintenance";
import { getCorporateHousingContextForMaintenanceRequest } from "@/lib/actions/corporate-allocations";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";
import { StatusBadge, PriorityBadge, SlaBadge } from "../page";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceCancelReason } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function MaintenanceRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, role, locale, users] = await Promise.all([getMaintenanceRequestById(id), getCurrentUserRole(), getLocale(), listAssignableUsers()]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canTriage = can("maintenance.request.triage", role);
  const canCancel = can("maintenance.request.cancel", role);
  const canCreateWorkOrder = can("maintenance.workOrder.create", role);
  const canViewCorporateHousing = can("corporateHousing.view", role);
  const corporateAllocation =
    canViewCorporateHousing && request.corporateOccupant && request.unit
      ? await getCorporateHousingContextForMaintenanceRequest(request.corporateOccupant.id, request.unit.id)
      : null;

  const locationLabel = request.unit
    ? request.unit.unitNumber
    : request.building
      ? pickLocalized(locale, request.building.nameAr, request.building.name)
      : request.compound
        ? pickLocalized(locale, request.compound.arabicName, request.compound.name)
        : "—";

  async function triage(formData: FormData) {
    "use server";
    await triageMaintenanceRequest(id, formData);
  }
  async function cancel(formData: FormData) {
    "use server";
    await cancelMaintenanceRequest(id, formData);
  }
  async function createWorkOrder(formData: FormData) {
    "use server";
    const woId = await createWorkOrderFromRequest(id, formData);
    redirect(`/operations/maintenance/work-orders/${woId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/maintenance/requests" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.requestsListTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{request.requestNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={request.status} label={t.maintenanceRequestStatus[request.status]} />
              <PriorityBadge priority={request.priority} label={t.maintenancePriority[request.priority]} />
              <SlaBadge status={request.slaOverallStatus} label={t.maintenanceSlaStatus[request.slaOverallStatus]} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCancel && request.status !== "RESOLVED" && request.status !== "CANCELLED" && request.status !== "WORK_ORDER_CREATED" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.cancelButton}</summary>
                <form action={cancel} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.maintenance.cancelRequestTitle}</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.cancelReasonLabel}</label>
                    <select name="cancelReason" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {(Object.keys(t.maintenanceCancelReason) as MaintenanceCancelReason[]).map((v) => (
                        <option key={v} value={v}>
                          {t.maintenanceCancelReason[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.cancelNoteLabel}</label>
                    <textarea name="cancelReasonNote" rows={2} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.confirmCancelButton}</button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title={t.maintenance.sectionSummary}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.maintenance.fieldTitle} value={request.title} />
              <Field label={t.maintenance.fieldCategory} value={t.maintenanceCategory[request.category]} />
              <Field label={t.maintenance.filterScope} value={t.maintenanceScopeType[request.scopeType]} />
              <Field label={t.maintenance.colReportedAt} value={dateTimeFmt.format(request.reportedAt)} />
            </dl>
          </Section>

          <Section title={t.maintenance.sectionDescription}>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{request.description || t.maintenance.notSet}</p>
          </Section>

          <Section title={t.maintenance.sectionLocation}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.maintenance.fieldUnit} value={locationLabel} />
              {request.contract && <Field label={t.maintenance.fieldContract} value={request.contract.contractNumber} />}
              {request.renter && <Field label={t.maintenance.fieldRenter} value={pickLocalized(locale, request.renter.fullNameAr, request.renter.fullName)} />}
            </dl>
          </Section>

          <Section title={t.maintenance.sectionReportedBy}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.maintenance.fieldReportedByType} value={t.maintenanceReportedByType[request.reportedByType]} />
              <Field label={t.maintenance.fieldReportedByName} value={request.reportedByName || request.reportedByUser?.name || t.maintenance.notSet} />
              <Field label={t.maintenance.fieldReportedByPhone} value={request.reportedByPhone || t.maintenance.notSet} />
              <Field label={t.maintenance.fieldSource} value={t.maintenanceRequestSource[request.source]} />
            </dl>
          </Section>

          {canViewCorporateHousing && request.corporateOccupant && (
            <Section title={t.corporateHousing.maintenanceTraceabilityTitle}>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field
                  label={t.corporateHousing.fieldOccupant}
                  value={
                    <Link href={`/corporate-housing/occupants/${request.corporateOccupant.id}`} className="text-brand-gold-dark hover:underline">
                      {pickLocalized(locale, request.corporateOccupant.fullNameAr, request.corporateOccupant.fullName)}
                    </Link>
                  }
                />
                <Field
                  label={t.corporateHousing.colCorporateAccount}
                  value={
                    <Link href={`/corporate-housing/accounts/${request.corporateOccupant.corporateAccount.id}`} className="text-brand-gold-dark hover:underline">
                      {request.corporateOccupant.corporateAccount.accountNumber} — {request.corporateOccupant.corporateAccount.displayName}
                    </Link>
                  }
                />
                {corporateAllocation && (
                  <Field
                    label={t.corporateHousing.currentAllocationLabel}
                    value={
                      <Link href={`/corporate-housing/allocations/${corporateAllocation.id}`} className="text-brand-gold-dark hover:underline">
                        {corporateAllocation.allocationNumber}
                      </Link>
                    }
                  />
                )}
              </dl>
            </Section>
          )}

          {request.moveIn && (
            <Section title={t.maintenance.sectionMoveInSource}>
              <p className="text-sm text-slate-700">
                {t.maintenance.moveInSourceLabel} —{" "}
                <Link href={`/operations/move-ins/${request.moveIn.id}`} className="text-brand-gold-dark hover:underline">
                  {request.moveIn.moveInNumber}
                </Link>
                {request.moveInInspectionItem && <span className="text-slate-500"> ({request.moveInInspectionItem.itemName})</span>}
              </p>
            </Section>
          )}

          {request.moveOut && (
            <Section title={t.maintenance.sectionMoveOutSource}>
              <p className="text-sm text-slate-700">
                {t.maintenance.moveOutSourceLabel} —{" "}
                <Link href={`/operations/move-outs/${request.moveOut.id}`} className="text-brand-gold-dark hover:underline">
                  {request.moveOut.moveOutNumber}
                </Link>
                {request.moveOutInspectionItem && <span className="text-slate-500"> ({request.moveOutInspectionItem.itemName})</span>}
              </p>
            </Section>
          )}

          <Section title={t.maintenance.sectionWorkOrder}>
            {request.workOrders.length === 0 ? (
              <p className="text-sm text-slate-400">{t.maintenance.noWorkOrderYet}</p>
            ) : (
              <ul className="space-y-1">
                {request.workOrders.map((wo) => (
                  <li key={wo.id}>
                    <Link href={`/operations/maintenance/work-orders/${wo.id}`} className="text-brand-gold-dark hover:underline text-sm">
                      {wo.workOrderNumber} — {t.maintenanceWorkOrderStatus[wo.status]}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.maintenance.sectionAudit}>
            <AuditTimeline entityType="MaintenanceRequest" entityId={request.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t.maintenance.sectionTriage}>
            {request.triagedAt && (
              <dl className="grid grid-cols-1 gap-2 text-sm mb-4">
                <Field label={t.maintenance.triagedAtLabel} value={dateTimeFmt.format(request.triagedAt)} />
                <Field label={t.maintenance.triagedByLabel} value={request.triagedByUser?.name ?? t.maintenance.notSet} />
              </dl>
            )}
            {canTriage && request.status !== "RESOLVED" && request.status !== "CANCELLED" && (
              <form action={triage} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldCategory}</label>
                  <select name="category" defaultValue={request.category} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
                      <option key={v} value={v}>
                        {t.maintenanceCategory[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldPriority}</label>
                  <select name="priority" defaultValue={request.priority} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(Object.keys(t.maintenancePriority) as MaintenancePriority[]).map((v) => (
                      <option key={v} value={v}>
                        {t.maintenancePriority[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.filterAssigned}</label>
                  <select name="assignedToUserId" defaultValue={request.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.triageNotesLabel}</label>
                  <textarea name="triageNotes" rows={2} defaultValue={request.triageNotes ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.triageButton}</button>
              </form>
            )}
          </Section>

          {canCreateWorkOrder && request.status === "TRIAGED" && (
            <Section title={t.maintenance.createWorkOrderButton}>
              <form action={createWorkOrder} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldPriority}</label>
                  <select name="priority" defaultValue={request.priority} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(Object.keys(t.maintenancePriority) as MaintenancePriority[]).map((v) => (
                      <option key={v} value={v}>
                        {t.maintenancePriority[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.maintenance.fieldEstimatedCost}</label>
                  <input type="number" step="0.01" name="estimatedCost" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.maintenance.createWorkOrderButton}</button>
              </form>
            </Section>
          )}

          <Section title={t.maintenance.sectionSla}>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Field label={t.maintenance.slaResponseDue} value={request.responseDueAt ? dateTimeFmt.format(request.responseDueAt) : t.maintenance.notSet} />
              <Field label={t.maintenance.slaResolutionDue} value={request.resolutionDueAt ? dateTimeFmt.format(request.resolutionDueAt) : t.maintenance.notSet} />
              <Field label={t.maintenance.slaLabel} value={t.maintenanceSlaStatus[request.slaOverallStatus]} />
            </dl>
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value}</dd>
    </div>
  );
}
