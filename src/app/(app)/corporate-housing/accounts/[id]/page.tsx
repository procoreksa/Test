import Link from "next/link";
import {
  getCorporateAccountById,
  updateCorporateAccount,
  getCorporateAccountManagerOptions,
} from "@/lib/actions/corporate-accounts";
import { upsertCorporateContact, activateCorporateContact, deactivateCorporateContact } from "@/lib/actions/corporate-contacts";
import { getCorporateAccountFinancialSnapshot, getCorporateAccountMaintenanceSnapshot } from "@/lib/actions/corporate-housing-reports";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter, currencyFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";
import { StatusBadge } from "../page";
import type { CorporateAccountStatus, CorporateContactType } from "@prisma/client";

export default async function CorporateAccountProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ account, contracts, occupants, allocations }, role, locale, users, financials, maintenance] = await Promise.all([
    getCorporateAccountById(id),
    getCurrentUserRole(),
    getLocale(),
    getCorporateAccountManagerOptions(),
    getCorporateAccountFinancialSnapshot(id),
    getCorporateAccountMaintenanceSnapshot(id),
  ]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const moneyFmt = currencyFormatter(locale);
  const canUpdate = can("corporateAccount.update", role);
  const canManageContacts = can("corporateContact.manage", role);
  const canCreateOccupant = can("corporateOccupant.create", role);
  const canCreateAllocation = can("corporateAllocation.create", role);

  const activeAllocations = allocations.filter((a) => a.status === "ACTIVE");
  const upcomingAllocations = allocations.filter((a) => a.status === "PLANNED");
  const historyAllocations = allocations.filter((a) => a.status === "ENDED" || a.status === "CANCELLED").slice(0, 10);
  const unitIds = new Set(contracts.map((c) => c.unit.id));

  async function update(formData: FormData) {
    "use server";
    formData.set("accountId", id);
    await updateCorporateAccount(formData);
  }
  async function addContact(formData: FormData) {
    "use server";
    formData.set("corporateAccountId", id);
    await upsertCorporateContact(formData);
  }
  async function activate(formData: FormData) {
    "use server";
    formData.set("corporateAccountId", id);
    await activateCorporateContact(formData);
  }
  async function deactivate(formData: FormData) {
    "use server";
    formData.set("corporateAccountId", id);
    await deactivateCorporateContact(formData);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/accounts" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.accountsTitle}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{account.displayName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">{account.accountNumber}</span>
              <StatusBadge status={account.status} label={t.corporateAccountStatus[account.status]} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateOccupant && (
              <Link href={`/corporate-housing/occupants/new?accountId=${id}`} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
                + {t.corporateHousing.newOccupantButton}
              </Link>
            )}
            {canCreateAllocation && (
              <Link href={`/corporate-housing/allocations/new?accountId=${id}`} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">
                + {t.corporateHousing.newAllocationButton}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title={t.corporateHousing.sectionAccountSummary}>
            {canUpdate ? (
              <form action={update} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldDisplayName}</label>
                  <input name="displayName" defaultValue={account.displayName} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldStatus}</label>
                  <select name="status" defaultValue={account.status} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {(Object.keys(t.corporateAccountStatus) as CorporateAccountStatus[]).map((v) => (
                      <option key={v} value={v}>
                        {t.corporateAccountStatus[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldIndustry}</label>
                    <input name="industry" defaultValue={account.industry ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldWebsite}</label>
                    <input name="website" defaultValue={account.website ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldAccountManager}</label>
                  <select name="accountManagerUserId" defaultValue={account.accountManagerUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNotes}</label>
                  <textarea name="notes" rows={3} defaultValue={account.notes ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2 text-sm font-semibold">{t.corporateHousing.saveButton}</button>
              </form>
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label={t.corporateHousing.fieldIndustry} value={account.industry ?? "—"} />
                <Field label={t.corporateHousing.fieldWebsite} value={account.website ?? "—"} />
                <Field label={t.corporateHousing.fieldAccountManager} value={account.accountManagerUser?.name ?? "—"} />
              </dl>
            )}
          </Section>

          <Section title={t.corporateHousing.sectionCorporateRenter}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t.corporateHousing.fieldCorporateRenter} value={pickLocalized(locale, account.renter.fullNameAr, account.renter.fullName)} />
              <Field label="VAT" value={account.renter.vatNumber ?? "—"} />
              <Field label={t.corporateHousing.fieldEmail} value={account.renter.email ?? "—"} />
              <Field label={t.corporateHousing.fieldPhone} value={account.renter.phone ?? "—"} />
            </dl>
          </Section>

          <Section title={t.corporateHousing.sectionContacts}>
            <ul className="divide-y divide-slate-100 mb-4">
              {account.contacts.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-slate-800">
                      {c.name} {c.isPrimary && <span className="text-xs text-brand-gold-dark">★</span>}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {t.corporateContactType[c.contactType]} · {c.email ?? "—"} · {c.phone ?? "—"}
                    </p>
                  </div>
                  {canManageContacts && (
                    <form action={c.isActive ? deactivate : activate}>
                      <input type="hidden" name="contactId" value={c.id} />
                      <button className="text-xs text-slate-500 hover:underline">
                        {c.isActive ? t.corporateHousing.deactivateContactButton : t.corporateHousing.activateContactButton}
                      </button>
                    </form>
                  )}
                </li>
              ))}
              {account.contacts.length === 0 && <li className="py-2 text-sm text-slate-400">{t.corporateHousing.emptyContacts}</li>}
            </ul>
            {canManageContacts && (
              <details>
                <summary className="cursor-pointer list-none text-sm text-brand-gold-dark hover:underline">+ {t.corporateHousing.addContactButton}</summary>
                <form action={addContact} className="mt-3 space-y-3 border border-slate-200 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldContactName}</label>
                    <input name="name" required className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldJobTitle}</label>
                      <input name="jobTitle" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldDepartment}</label>
                      <input name="department" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldEmail}</label>
                      <input name="email" type="email" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldPhone}</label>
                      <input name="phone" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.corporateHousing.fieldContactType}</label>
                    <select name="contactType" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {(Object.keys(t.corporateContactType) as CorporateContactType[]).map((v) => (
                        <option key={v} value={v}>
                          {t.corporateContactType[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" name="isPrimary" className="rounded border-slate-300" />
                    {t.corporateHousing.fieldIsPrimary}
                  </label>
                  <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.corporateHousing.saveButton}</button>
                </form>
              </details>
            )}
          </Section>

          <Section title={t.corporateHousing.sectionContracts}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2">
                      <Link href={`/contracts/${c.id}/edit`} className="text-brand-gold-dark hover:underline">
                        {c.contractNumber}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-500">
                      {c.unit.unitNumber} — {unitLocationLabel(locale, c.unit)}
                    </td>
                    <td className="py-2 text-slate-500 whitespace-nowrap">
                      {dateFmt.format(c.startDate)} – {dateFmt.format(c.endDate)}
                    </td>
                    <td className="py-2 text-slate-500">{c.status}</td>
                  </tr>
                ))}
                {contracts.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-slate-400">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title={t.corporateHousing.sectionUnits}>
            <div className="flex flex-wrap gap-2">
              {Array.from(unitIds).length === 0 && <p className="text-sm text-slate-400">—</p>}
              {contracts
                .filter((c, idx) => contracts.findIndex((cc) => cc.unit.id === c.unit.id) === idx)
                .map((c) => (
                  <Link key={c.unit.id} href={`/units/${c.unit.id}/ownership`} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm">
                    {c.unit.unitNumber}
                  </Link>
                ))}
            </div>
          </Section>

          <Section title={t.corporateHousing.sectionOccupants}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {occupants.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2">
                      <Link href={`/corporate-housing/occupants/${o.id}`} className="text-brand-gold-dark hover:underline">
                        {pickLocalized(locale, o.fullNameAr, o.fullName)}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-500">{o.employeeNumber ?? "—"}</td>
                    <td className="py-2 text-slate-500">{t.corporateOccupantStatus[o.status]}</td>
                  </tr>
                ))}
                {occupants.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-slate-400">{t.corporateHousing.emptyOccupants}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title={t.corporateHousing.sectionActiveAllocations}>
            <AllocationTable rows={activeAllocations} locale={locale} dateFmt={dateFmt} t={t} />
          </Section>
          <Section title={t.corporateHousing.sectionUpcomingAllocations}>
            <AllocationTable rows={upcomingAllocations} locale={locale} dateFmt={dateFmt} t={t} />
          </Section>
          <Section title={t.corporateHousing.sectionAllocationHistory}>
            <AllocationTable rows={historyAllocations} locale={locale} dateFmt={dateFmt} t={t} />
          </Section>

          <Section title={t.corporateHousing.sectionAudit}>
            <AuditTimeline entityType="CorporateAccount" entityId={account.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t.corporateHousing.sectionFinancialSnapshot}>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Field label={t.corporateHousing.colContractValue} value={moneyFmt.format(Number(financials.contractValue))} />
              <Field label={t.corporateHousing.colInvoiced} value={moneyFmt.format(Number(financials.invoiced))} />
              <Field label={t.corporateHousing.colPaid} value={moneyFmt.format(Number(financials.paid))} />
              <Field label={t.corporateHousing.colOutstanding} value={moneyFmt.format(Number(financials.outstanding))} />
              <Field label={t.corporateHousing.colOverdue} value={moneyFmt.format(Number(financials.overdue))} />
            </dl>
          </Section>

          <Section title={t.corporateHousing.sectionMaintenanceSnapshot}>
            <p className="text-sm text-slate-600 mb-2">
              {t.corporateHousing.cardOpenMaintenance}: <span className="font-semibold">{maintenance.openCount}</span>
            </p>
            <ul className="space-y-1">
              {maintenance.recent.map((m) => (
                <li key={m.id} className="text-xs text-slate-500">
                  {m.requestNumber} — {m.unit?.unitNumber ?? "—"} — {m.status}
                </li>
              ))}
              {maintenance.recent.length === 0 && <li className="text-xs text-slate-400">—</li>}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function AllocationTable({
  rows,
  locale,
  dateFmt,
  t,
}: {
  rows: Array<{ id: string; allocationNumber: string; startDate: Date; plannedEndDate: Date | null; status: string; occupant: { fullName: string; fullNameAr: string | null }; unit: { unitNumber: string } }>;
  locale: "en" | "ar";
  dateFmt: Intl.DateTimeFormat;
  t: ReturnType<typeof getDictionary>;
}) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="py-2">
              <Link href={`/corporate-housing/allocations/${a.id}`} className="text-brand-gold-dark hover:underline">
                {a.allocationNumber}
              </Link>
            </td>
            <td className="py-2 text-slate-500">{pickLocalized(locale, a.occupant.fullNameAr, a.occupant.fullName)}</td>
            <td className="py-2 text-slate-500">{a.unit.unitNumber}</td>
            <td className="py-2 text-slate-500 whitespace-nowrap">
              {dateFmt.format(a.startDate)} {a.plannedEndDate ? `– ${dateFmt.format(a.plannedEndDate)}` : ""}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td className="py-4 text-center text-slate-400">{t.corporateHousing.emptyAllocations}</td>
          </tr>
        )}
      </tbody>
    </table>
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
