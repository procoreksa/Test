import Link from "next/link";
import { getOwnerById, updateOwner, deleteOwner } from "@/lib/actions/owners";
import { listOwnedAssets } from "@/lib/actions/ownership";
import { getOwnerBalance, listOwnerLedger, postManualLedgerEntry, reverseLedgerEntry } from "@/lib/actions/owner-ledger";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";

function assetLabel(
  locale: Awaited<ReturnType<typeof getLocale>>,
  ownership: Awaited<ReturnType<typeof listOwnedAssets>>[number]
) {
  if (ownership.unit) {
    const building = ownership.unit.floor.building;
    return `${pickLocalized(locale, building.compound.arabicName, building.compound.name)} / ${pickLocalized(locale, building.nameAr, building.name)} / ${ownership.unit.unitNumber}`;
  }
  if (ownership.building) {
    return `${pickLocalized(locale, ownership.building.compound.arabicName, ownership.building.compound.name)} / ${pickLocalized(locale, ownership.building.nameAr, ownership.building.name)}`;
  }
  if (ownership.compound) {
    return pickLocalized(locale, ownership.compound.arabicName, ownership.compound.name);
  }
  return "—";
}

export default async function OwnerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [owner, ownedAssets, balance, ledger, locale, role] = await Promise.all([
    getOwnerById(id),
    listOwnedAssets(id),
    getOwnerBalance(id),
    listOwnerLedger(id),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canUpdate = can("owner.update", role);
  const canPostLedger = can("ownerLedger.create", role);
  const canReverseLedger = can("ownerLedger.reverse", role);
  const recentLedger = [...ledger].slice(-10).reverse();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/owners" className="text-brand-gold-dark hover:underline text-sm">
          {t.owners.profile.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{pickLocalized(locale, owner.nameAr, owner.name)}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerType[owner.ownerType]}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.owners.profile.balanceLabel} value={sar.format(Number(balance.balance))} />
        <StatCard label={t.owners.profile.totalIncomeLabel} value={sar.format(Number(balance.totalIncome))} />
        <StatCard label={t.owners.profile.totalExpensesLabel} value={sar.format(Number(balance.totalExpenses))} />
        <StatCard label={t.owners.profile.totalDistributionsLabel} value={sar.format(Number(balance.totalDistributions))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.owners.profile.infoTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <InfoRow label={t.owners.fieldEmail} value={owner.email} />
            <InfoRow label={t.owners.fieldMobile} value={owner.mobile} />
            <InfoRow label={t.owners.fieldNationalId} value={owner.nationalId} />
            <InfoRow label={t.owners.fieldCompanyRegistrationNumber} value={owner.companyRegistrationNumber} />
            <InfoRow label={t.owners.fieldCity} value={owner.city} />
            <InfoRow label={t.owners.fieldCountry} value={owner.country} />
            <InfoRow label={t.owners.fieldBankName} value={owner.bankName} />
            <InfoRow label={t.owners.fieldIban} value={owner.iban} />
          </dl>

          {canUpdate && (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none text-sm text-brand-gold-dark font-medium">
                {t.owners.profile.editTitle}
                <span className="ms-2 group-open:rotate-45 inline-block transition-transform">+</span>
              </summary>
              <form action={updateOwner} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="hidden" name="ownerId" value={owner.id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.owners.fieldOwnerType}</label>
                  <select name="ownerType" defaultValue={owner.ownerType} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {(Object.keys(t.ownerType) as Array<keyof typeof t.ownerType>).map((value) => (
                      <option key={value} value={value}>
                        {t.ownerType[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <EditField label={t.owners.fieldName} name="name" defaultValue={owner.name} required />
                <EditField label={t.owners.fieldNameAr} name="nameAr" defaultValue={owner.nameAr ?? ""} />
                <EditField label={t.owners.fieldNationalId} name="nationalId" defaultValue={owner.nationalId ?? ""} />
                <EditField label={t.owners.fieldIqamaNumber} name="iqamaNumber" defaultValue={owner.iqamaNumber ?? ""} />
                <EditField label={t.owners.fieldPassportNumber} name="passportNumber" defaultValue={owner.passportNumber ?? ""} />
                <EditField
                  label={t.owners.fieldCompanyRegistrationNumber}
                  name="companyRegistrationNumber"
                  defaultValue={owner.companyRegistrationNumber ?? ""}
                />
                <EditField label={t.owners.fieldVatNumber} name="vatNumber" defaultValue={owner.vatNumber ?? ""} />
                <EditField label={t.owners.fieldEmail} name="email" defaultValue={owner.email ?? ""} />
                <EditField label={t.owners.fieldMobile} name="mobile" defaultValue={owner.mobile ?? ""} />
                <EditField label={t.owners.fieldAlternateMobile} name="alternateMobile" defaultValue={owner.alternateMobile ?? ""} />
                <EditField label={t.owners.fieldAddress} name="address" defaultValue={owner.address ?? ""} />
                <EditField label={t.owners.fieldCity} name="city" defaultValue={owner.city ?? ""} />
                <EditField label={t.owners.fieldCountry} name="country" defaultValue={owner.country ?? ""} />
                <EditField label={t.owners.fieldBankName} name="bankName" defaultValue={owner.bankName ?? ""} />
                <EditField label={t.owners.fieldBankAccountName} name="bankAccountName" defaultValue={owner.bankAccountName ?? ""} />
                <EditField label={t.owners.fieldIban} name="iban" defaultValue={owner.iban ?? ""} />
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.owners.fieldNotes}</label>
                  <textarea name="notes" defaultValue={owner.notes ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">
                    {t.owners.save}
                  </button>
                </div>
              </form>
              <form
                className="mt-3"
                action={async () => {
                  "use server";
                  await deleteOwner(owner.id);
                }}
              >
                <button className="text-red-500 hover:underline text-xs">{t.owners.delete}</button>
              </form>
            </details>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.owners.profile.ownedAssetsTitle}</h2>
          {ownedAssets.length === 0 ? (
            <p className="text-sm text-slate-400">{t.owners.profile.ownedAssetsEmpty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-right">
                <tr>
                  <th className="py-1 font-medium">{t.owners.profile.colAsset}</th>
                  <th className="py-1 font-medium">{t.owners.profile.colOwnershipPercent}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ownedAssets.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 text-slate-700">{assetLabel(locale, a)}</td>
                    <td className="py-2 font-medium">{Number(a.ownershipPercentage).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">{t.owners.profile.recentLedgerTitle}</h2>
          <Link href={`/reports/owner-statement?ownerId=${owner.id}`} className="text-sm text-brand-gold-dark hover:underline">
            {t.owners.profile.viewFullStatement}
          </Link>
        </div>
        {recentLedger.length === 0 ? (
          <p className="text-sm text-slate-400">{t.owners.profile.recentLedgerEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-3 py-2 font-medium">{t.ownerLedger.colDate}</th>
                <th className="px-3 py-2 font-medium">{t.ownerLedger.colDescription}</th>
                <th className="px-3 py-2 font-medium">{t.ownerLedger.colDebit}</th>
                <th className="px-3 py-2 font-medium">{t.ownerLedger.colCredit}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentLedger.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-slate-500">{dateFmt.format(e.entryDate)}</td>
                  <td className="px-3 py-2 text-slate-700">{pickLocalized(locale, e.descriptionAr, e.description)}</td>
                  <td className="px-3 py-2">{Number(e.debit) > 0 ? sar.format(Number(e.debit)) : "—"}</td>
                  <td className="px-3 py-2">{Number(e.credit) > 0 ? sar.format(Number(e.credit)) : "—"}</td>
                  <td className="px-3 py-2 text-left">
                    {canReverseLedger && e.entryType !== "REVERSAL" && !e.reversedByEntry && (
                      <form
                        action={async () => {
                          "use server";
                          await reverseLedgerEntry(e.id);
                        }}
                      >
                        <button className="text-red-500 hover:underline text-xs">{t.ownerLedger.reverse}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canPostLedger && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.owners.profile.postEntryTitle}</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await postManualLedgerEntry(formData);
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <input type="hidden" name="ownerId" value={owner.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldEntryType}</label>
              <select name="entryType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(
                  [
                    "RENT_INCOME",
                    "OTHER_INCOME",
                    "MANAGEMENT_FEE",
                    "MAINTENANCE_EXPENSE",
                    "UTILITY_EXPENSE",
                    "SERVICE_EXPENSE",
                    "GOVERNMENT_FEE",
                    "OTHER_EXPENSE",
                    "OWNER_CONTRIBUTION",
                    "OWNER_DISTRIBUTION",
                    "ADJUSTMENT",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t.ownerLedgerEntryType[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldSide}</label>
              <select name="side" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="debit">{t.ownerLedger.debitLabel}</option>
                <option value="credit">{t.ownerLedger.creditLabel}</option>
              </select>
            </div>
            <Field label={t.ownerLedger.fieldAmount} name="amount" type="number" step="0.01" required />
            <Field label={t.ownerLedger.fieldEntryDate} name="entryDate" type="date" required />
            <Field label={t.ownerLedger.fieldDescription} name="description" required />
            <Field label={t.ownerLedger.fieldDescriptionAr} name="descriptionAr" />
            <div className="md:col-span-3">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.ownerLedger.submit}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-1">{t.owners.profile.documentsPlaceholderTitle}</h2>
        <p className="text-sm text-slate-400">{t.owners.profile.documentsPlaceholderBody}</p>
      </div>

      <AuditTimeline entityType="Owner" entityId={owner.id} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value || "—"}</dd>
    </>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}

function EditField({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
