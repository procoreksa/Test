import Link from "next/link";
import {
  getCorporateAllocationById,
  activateCorporateAllocation,
  endCorporateAllocation,
  cancelCorporateAllocation,
  transferCorporateOccupant,
  getEligibleContractsForAccount,
} from "@/lib/actions/corporate-allocations";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";
import { StatusBadge } from "../page";
import { redirect } from "next/navigation";

export default async function CorporateAllocationWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ allocation, moveIn, maintenanceRequests }, role, locale] = await Promise.all([getCorporateAllocationById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  const canActivate = can("corporateAllocation.activate", role);
  const canEnd = can("corporateAllocation.end", role);
  const canCancel = can("corporateAllocation.cancel", role);
  const canTransfer = can("corporateAllocation.transfer", role);

  const eligibleContracts = canTransfer && (allocation.status === "PLANNED" || allocation.status === "ACTIVE") ? await getEligibleContractsForAccount(allocation.corporateAccount.id) : [];

  async function activate(formData: FormData) {
    "use server";
    formData.set("allocationId", id);
    await activateCorporateAllocation(formData);
  }
  async function end(formData: FormData) {
    "use server";
    formData.set("allocationId", id);
    await endCorporateAllocation(formData);
  }
  async function cancel(formData: FormData) {
    "use server";
    formData.set("allocationId", id);
    await cancelCorporateAllocation(formData);
  }
  async function transfer(formData: FormData) {
    "use server";
    formData.set("currentAllocationId", id);
    const newId = await transferCorporateOccupant(formData);
    redirect(`/corporate-housing/allocations/${newId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/allocations" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.allocationsTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{allocation.allocationNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={allocation.status} label={t.corporateHousingAllocationStatus[allocation.status]} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canActivate && allocation.status === "PLANNED" && (
              <form action={activate}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.activateAllocationButton}</button>
              </form>
            )}
            {canCancel && allocation.status === "PLANNED" && (
              <form action={cancel}>
                <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.cancelAllocationButton}</button>
              </form>
            )}
            {canEnd && allocation.status === "ACTIVE" && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.endAllocationButton}</summary>
                <form action={end} className="absolute z-10 end-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldPlannedEndDate}</label>
                    <input type="date" name="actualEndDate" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.confirmEndAllocationButton}</button>
                </form>
              </details>
            )}
            {canTransfer && (allocation.status === "PLANNED" || allocation.status === "ACTIVE") && (
              <details className="relative">
                <summary className="cursor-pointer list-none bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.transferOccupantButton}</summary>
                <form action={transfer} className="absolute z-10 end-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{t.corporateHousing.transferPageTitle}</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNewContract}</label>
                    <select name="newContractId" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">—</option>
                      {eligibleContracts
                        .filter((c) => c.id !== allocation.contract.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.contractNumber} — {c.unit.unitNumber}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNewStartDate}</label>
                    <input type="date" name="newStartDate" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNewPlannedEndDate}</label>
                    <input type="date" name="newPlannedEndDate" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.submitTransferButton}</button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title={t.corporateHousing.sectionAllocationSummary}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.corporateHousing.fieldStartDate} value={dateFmt.format(allocation.startDate)} />
              <Field label={t.corporateHousing.fieldPlannedEndDate} value={allocation.plannedEndDate ? dateFmt.format(allocation.plannedEndDate) : "—"} />
              <Field label={t.corporateHousing.colActualEndDate} value={allocation.actualEndDate ? dateFmt.format(allocation.actualEndDate) : "—"} />
              <Field label={t.corporateHousing.fieldBedroomNumber} value={allocation.bedroomNumber ?? "—"} />
              <Field label={t.corporateHousing.fieldRoomLabel} value={allocation.roomLabel ?? "—"} />
            </dl>
            {allocation.notes && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{allocation.notes}</p>}
          </Section>

          <Section title={t.corporateHousing.fieldContract}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field
                label={t.corporateHousing.colContract}
                value={
                  <Link href={`/contracts/${allocation.contract.id}/edit`} className="text-brand-gold-dark hover:underline">
                    {allocation.contract.contractNumber}
                  </Link>
                }
              />
              <Field label={t.corporateHousing.colStatus} value={allocation.contract.status} />
              <Field
                label={t.corporateHousing.colUnit}
                value={
                  <Link href={`/units/${allocation.unit.id}/ownership`} className="text-brand-gold-dark hover:underline">
                    {allocation.unit.unitNumber}
                  </Link>
                }
              />
              <Field label={t.corporateHousing.sectionUnits} value={unitLocationLabel(locale, allocation.unit)} />
            </dl>
          </Section>

          <Section title={t.corporateHousing.sectionMoveInContext}>
            {moveIn ? (
              <p className="text-sm text-slate-700">
                <Link href={`/operations/move-ins/${moveIn.id}`} className="text-brand-gold-dark hover:underline">
                  {moveIn.moveInNumber}
                </Link>{" "}
                — {moveIn.status}
              </p>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </Section>

          <Section title={t.corporateHousing.sectionMaintenanceContext}>
            <ul className="space-y-1">
              {maintenanceRequests.map((m) => (
                <li key={m.id} className="text-sm text-slate-600">
                  <Link href={`/operations/maintenance/requests/${m.id}`} className="text-brand-gold-dark hover:underline">
                    {m.requestNumber}
                  </Link>{" "}
                  — {m.category} — {m.status}
                </li>
              ))}
              {maintenanceRequests.length === 0 && <li className="text-sm text-slate-400">—</li>}
            </ul>
          </Section>

          <Section title={t.corporateHousing.sectionAudit}>
            <AuditTimeline entityType="CorporateHousingAllocation" entityId={allocation.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t.corporateHousing.colCorporateAccount}>
            <Link href={`/corporate-housing/accounts/${allocation.corporateAccount.id}`} className="text-brand-gold-dark hover:underline text-sm">
              {allocation.corporateAccount.accountNumber} — {allocation.corporateAccount.displayName}
            </Link>
          </Section>
          <Section title={t.corporateHousing.fieldOccupant}>
            <Link href={`/corporate-housing/occupants/${allocation.occupant.id}`} className="text-brand-gold-dark hover:underline text-sm">
              {pickLocalized(locale, allocation.occupant.fullNameAr, allocation.occupant.fullName)}
            </Link>
            {allocation.occupant.employeeNumber && <p className="text-xs text-slate-500 mt-1">{allocation.occupant.employeeNumber}</p>}
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
