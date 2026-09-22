import Link from "next/link";
import { format } from "date-fns";
import { getContractEditContext, updateContract } from "@/lib/actions/contracts";
import { listUnits } from "@/lib/actions/units";
import { listRenters } from "@/lib/actions/renters";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ contract, hasBilling }, locale, role] = await Promise.all([
    getContractEditContext(id),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);

  const propertyName = unitLocationLabel(locale, contract.unit);
  const renterName = pickLocalized(locale, contract.renter.fullNameAr, contract.renter.fullName);

  if (!can("contract.update", role)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Link href="/contracts" className="text-brand-gold-dark hover:underline text-sm">
          {t.contracts.editPage.back}
        </Link>
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{t.validation.notAuthorized}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/contracts" className="text-brand-gold-dark hover:underline text-sm">
          {t.contracts.editPage.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.contracts.editPage.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.contracts.editPage.subtitle(contract.contractNumber)}</p>
      </div>

      {hasBilling && (
        <p className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {t.contracts.editPage.lockedNotice}
        </p>
      )}

      <form action={updateContract} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <input type="hidden" name="contractId" value={contract.id} />

        {hasBilling ? (
          <>
            <ReadOnlyField label={t.contracts.fieldUnit} value={`${propertyName} / ${contract.unit.unitNumber}`} />
            <ReadOnlyField label={t.contracts.fieldRenter} value={renterName} />
            <ReadOnlyField label={t.contracts.fieldFrequency} value={t.paymentFrequency[contract.paymentFrequency]} />
            <ReadOnlyField label={t.contracts.fieldStartDate} value={format(contract.startDate, "yyyy-MM-dd")} />
            <ReadOnlyField label={t.contracts.fieldEndDate} value={format(contract.endDate, "yyyy-MM-dd")} />
            <ReadOnlyField label={t.contracts.fieldRentAmount} value={String(contract.rentAmount)} />
            <ReadOnlyField label={t.contracts.fieldSecurityDeposit} value={contract.securityDeposit ? String(contract.securityDeposit) : "—"} />
            <ReadOnlyField label={t.contracts.fieldCommission} value={contract.commissionAmount ? String(contract.commissionAmount) : "—"} />
            <ReadOnlyField label={t.contracts.fieldCleaning} value={contract.cleaningAmount ? String(contract.cleaningAmount) : "—"} />
          </>
        ) : (
          <EditableContractFields contract={contract} locale={locale} t={t} />
        )}

        <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
          <input type="checkbox" name="vatApplicable" defaultChecked={contract.vatApplicable} className="rounded border-slate-300" />
          {t.contracts.fieldVatApplicable}
        </label>
        {!hasBilling && <p className="md:col-span-3 text-xs text-slate-400 -mt-2">{t.contracts.extraChargesHint}</p>}
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldNotes}</label>
          <textarea name="notes" rows={2} defaultValue={contract.notes ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-3">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.contracts.editPage.submit}
          </button>
        </div>
      </form>

      <AuditTimeline entityType="Contract" entityId={contract.id} />
    </div>
  );
}

async function EditableContractFields({
  contract,
  locale,
  t,
}: {
  contract: Awaited<ReturnType<typeof getContractEditContext>>["contract"];
  locale: Awaited<ReturnType<typeof getLocale>>;
  t: ReturnType<typeof getDictionary>;
}) {
  const [units, renters] = await Promise.all([listUnits(), listRenters()]);
  const selectableUnits = units.filter((u) => u.status !== "OCCUPIED" || u.id === contract.unitId);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldUnit}</label>
        <select name="unitId" defaultValue={contract.unitId} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {selectableUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {t.contracts.unitOptionLabel(unitLocationLabel(locale, u), u.unitNumber)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldRenter}</label>
        <select name="renterId" defaultValue={contract.renterId} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {renters.map((r) => (
            <option key={r.id} value={r.id}>
              {pickLocalized(locale, r.fullNameAr, r.fullName)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldFrequency}</label>
        <select name="paymentFrequency" defaultValue={contract.paymentFrequency} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {(Object.keys(t.paymentFrequency) as Array<keyof typeof t.paymentFrequency>).map((value) => (
            <option key={value} value={value}>
              {t.paymentFrequency[value]}
            </option>
          ))}
        </select>
      </div>
      <Field label={t.contracts.fieldStartDate} name="startDate" type="date" defaultValue={format(contract.startDate, "yyyy-MM-dd")} required />
      <Field label={t.contracts.fieldEndDate} name="endDate" type="date" defaultValue={format(contract.endDate, "yyyy-MM-dd")} required />
      <Field
        label={t.contracts.fieldRentAmount}
        name="rentAmount"
        type="number"
        step="0.01"
        defaultValue={String(contract.rentAmount)}
        required
      />
      <Field
        label={t.contracts.fieldSecurityDeposit}
        name="securityDeposit"
        type="number"
        step="0.01"
        defaultValue={contract.securityDeposit ? String(contract.securityDeposit) : ""}
      />
      <Field
        label={t.contracts.fieldCommission}
        name="commissionAmount"
        type="number"
        step="0.01"
        defaultValue={contract.commissionAmount ? String(contract.commissionAmount) : ""}
      />
      <Field
        label={t.contracts.fieldCleaning}
        name="cleaningAmount"
        type="number"
        step="0.01"
        defaultValue={contract.cleaningAmount ? String(contract.cleaningAmount) : ""}
      />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldExtraChargesMode}</label>
        <select name="extraChargesMode" defaultValue={contract.extraChargesMode} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="ONE_TIME">{t.contracts.extraChargesModeOneTime}</option>
          <option value="SPLIT">{t.contracts.extraChargesModeSplit}</option>
        </select>
      </div>
    </>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  step,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 text-sm">{value}</p>
    </div>
  );
}
