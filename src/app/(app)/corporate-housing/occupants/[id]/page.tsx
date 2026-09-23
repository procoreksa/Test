import Link from "next/link";
import { getCorporateOccupantById, upsertCorporateOccupant } from "@/lib/actions/corporate-occupants";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";
import type { CorporateOccupantStatus } from "@prisma/client";

export default async function CorporateOccupantProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ occupant, allocations, maintenanceRequests }, role, locale] = await Promise.all([getCorporateOccupantById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const canUpdate = can("corporateOccupant.update", role);
  const canCreateAllocation = can("corporateAllocation.create", role);

  const currentAllocation = allocations.find((a) => a.status === "ACTIVE") ?? allocations.find((a) => a.status === "PLANNED");

  async function update(formData: FormData) {
    "use server";
    formData.set("occupantId", id);
    formData.set("corporateAccountId", occupant.corporateAccountId);
    await upsertCorporateOccupant(formData);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/occupants" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.occupantsTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{pickLocalized(locale, occupant.fullNameAr, occupant.fullName)}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">{occupant.employeeNumber ?? "—"}</span>
              <span className="text-xs text-slate-400">· {t.corporateOccupantStatus[occupant.status]}</span>
            </div>
          </div>
          {canCreateAllocation && (
            <Link
              href={`/corporate-housing/allocations/new?accountId=${occupant.corporateAccountId}&occupantId=${occupant.id}`}
              className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold"
            >
              + {t.corporateHousing.newAllocationButton}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title={t.corporateHousing.sectionEmployeeSummary}>
            {canUpdate ? (
              <form action={update} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldFullName}</label>
                    <input name="fullName" defaultValue={occupant.fullName} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldFullNameAr}</label>
                    <input name="fullNameAr" dir="rtl" defaultValue={occupant.fullNameAr ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.colEmployeeNumber}</label>
                    <input name="employeeNumber" defaultValue={occupant.employeeNumber ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNationality}</label>
                    <input name="nationality" defaultValue={occupant.nationality ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldJobTitle}</label>
                    <input name="jobTitle" defaultValue={occupant.jobTitle ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldDepartment}</label>
                    <input name="department" defaultValue={occupant.department ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldStatus}</label>
                  <select name="status" defaultValue={occupant.status} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {(Object.keys(t.corporateOccupantStatus) as CorporateOccupantStatus[]).map((v) => (
                      <option key={v} value={v}>
                        {t.corporateOccupantStatus[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2 text-sm font-semibold">{t.corporateHousing.saveButton}</button>
              </form>
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label={t.corporateHousing.fieldJobTitle} value={occupant.jobTitle ?? "—"} />
                <Field label={t.corporateHousing.fieldDepartment} value={occupant.department ?? "—"} />
                <Field label={t.corporateHousing.fieldNationality} value={occupant.nationality ?? "—"} />
              </dl>
            )}
          </Section>

          <Section title={t.corporateHousing.sectionContactDetails}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.corporateHousing.fieldEmail} value={occupant.email ?? "—"} />
              <Field label={t.corporateHousing.fieldPhone} value={occupant.phone ?? "—"} />
              <Field label={t.corporateHousing.fieldEmergencyContactName} value={occupant.emergencyContactName ?? "—"} />
              <Field label={t.corporateHousing.fieldEmergencyContactPhone} value={occupant.emergencyContactPhone ?? "—"} />
            </dl>
          </Section>

          <Section title={t.corporateHousing.sectionCurrentAllocation}>
            {currentAllocation ? (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field
                  label={t.corporateHousing.colAllocationNumber}
                  value={
                    <Link href={`/corporate-housing/allocations/${currentAllocation.id}`} className="text-brand-gold-dark hover:underline">
                      {currentAllocation.allocationNumber}
                    </Link>
                  }
                />
                <Field label={t.corporateHousing.colUnit} value={currentAllocation.unit.unitNumber} />
                <Field label={t.corporateHousing.colContract} value={currentAllocation.contract.contractNumber} />
                <Field label={t.corporateHousing.colStartDate} value={dateFmt.format(currentAllocation.startDate)} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">{t.corporateHousing.noCurrentAllocation}</p>
            )}
          </Section>

          <Section title={t.corporateHousing.sectionAllocationHistory}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">
                      <Link href={`/corporate-housing/allocations/${a.id}`} className="text-brand-gold-dark hover:underline">
                        {a.allocationNumber}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-500">{a.unit.unitNumber}</td>
                    <td className="py-2 text-slate-500">{t.corporateHousingAllocationStatus[a.status]}</td>
                    <td className="py-2 text-slate-500 whitespace-nowrap">
                      {dateFmt.format(a.startDate)} {a.actualEndDate ? `– ${dateFmt.format(a.actualEndDate)}` : ""}
                    </td>
                  </tr>
                ))}
                {allocations.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-slate-400">{t.corporateHousing.emptyAllocations}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title={t.corporateHousing.sectionMaintenanceReported}>
            <ul className="space-y-1">
              {maintenanceRequests.map((m) => (
                <li key={m.id} className="text-sm text-slate-600">
                  {m.requestNumber} — {m.category} — {m.status}
                </li>
              ))}
              {maintenanceRequests.length === 0 && <li className="text-sm text-slate-400">—</li>}
            </ul>
          </Section>

          <Section title={t.corporateHousing.sectionAudit}>
            <AuditTimeline entityType="CorporateOccupant" entityId={occupant.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t.corporateHousing.colCorporateAccount}>
            <Link href={`/corporate-housing/accounts/${occupant.corporateAccount.id}`} className="text-brand-gold-dark hover:underline text-sm">
              {occupant.corporateAccount.accountNumber} — {occupant.corporateAccount.displayName}
            </Link>
          </Section>
          {occupant.notes && (
            <Section title={t.corporateHousing.fieldNotes}>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{occupant.notes}</p>
            </Section>
          )}
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
