import Link from "next/link";
import { format, addYears } from "date-fns";
import { getContractById, renewContract } from "@/lib/actions/contracts";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

export default async function RenewContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [contract, locale, role] = await Promise.all([getContractById(id), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);

  const propertyName = unitLocationLabel(locale, contract.unit);
  const renterName = pickLocalized(locale, contract.renter.fullNameAr, contract.renter.fullName);
  const defaultStart = format(contract.endDate, "yyyy-MM-dd");
  const defaultEnd = format(addYears(contract.endDate, 1), "yyyy-MM-dd");

  if (!can("contract.renew", role)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Link href="/contracts" className="text-brand-gold-dark hover:underline text-sm">
          {t.contracts.renewPage.back}
        </Link>
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{t.validation.notAuthorized}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/contracts" className="text-brand-gold-dark hover:underline text-sm">
          {t.contracts.renewPage.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.contracts.renewPage.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.contracts.renewPage.subtitle(contract.contractNumber)}</p>
      </div>

      <form action={renewContract} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <input type="hidden" name="contractId" value={contract.id} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.renewPage.unitLabel}</label>
          <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 text-sm">
            {propertyName} / {contract.unit.unitNumber}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.renewPage.renterLabel}</label>
          <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 text-sm">
            {renterName}
          </p>
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
        <Field label={t.contracts.fieldStartDate} name="startDate" type="date" defaultValue={defaultStart} required />
        <Field label={t.contracts.fieldEndDate} name="endDate" type="date" defaultValue={defaultEnd} required />
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
        <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
          <input type="checkbox" name="vatApplicable" defaultChecked={contract.vatApplicable} className="rounded border-slate-300" />
          {t.contracts.fieldVatApplicable}
        </label>
        <p className="md:col-span-3 text-xs text-slate-400 -mt-2">{t.contracts.extraChargesHint}</p>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldNotes}</label>
          <textarea name="notes" rows={2} defaultValue={contract.notes ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-3">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.contracts.renewPage.submit}
          </button>
        </div>
      </form>
    </div>
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
