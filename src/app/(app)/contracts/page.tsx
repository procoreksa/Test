import { listContracts, createContract, terminateContract } from "@/lib/actions/contracts";
import { listUnits } from "@/lib/actions/units";
import { listRenters } from "@/lib/actions/renters";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  TERMINATED: "bg-red-100 text-red-700",
};

export default async function ContractsPage() {
  const [contracts, units, renters, locale] = await Promise.all([
    listContracts(),
    listUnits(),
    listRenters(),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const availableUnits = units.filter((u) => u.status !== "OCCUPIED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.contracts.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.contracts.subtitle}</p>
      </div>

      <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
          {t.contracts.addNew}
          <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
        </summary>
        <form action={createContract} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldUnit}</label>
            <select name="unitId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {availableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {t.contracts.unitOptionLabel(pickLocalized(locale, u.property.nameAr, u.property.name), u.unitNumber)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldRenter}</label>
            <select name="renterId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {renters.map((r) => (
                <option key={r.id} value={r.id}>
                  {pickLocalized(locale, r.fullNameAr, r.fullName)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldFrequency}</label>
            <select name="paymentFrequency" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.paymentFrequency) as Array<keyof typeof t.paymentFrequency>).map((value) => (
                <option key={value} value={value}>
                  {t.paymentFrequency[value]}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.contracts.fieldStartDate} name="startDate" type="date" required />
          <Field label={t.contracts.fieldEndDate} name="endDate" type="date" required />
          <Field label={t.contracts.fieldRentAmount} name="rentAmount" type="number" step="0.01" required />
          <Field label={t.contracts.fieldSecurityDeposit} name="securityDeposit" type="number" step="0.01" />
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
            <input type="checkbox" name="vatApplicable" className="rounded border-slate-300" />
            {t.contracts.fieldVatApplicable}
          </label>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldNotes}</label>
            <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="md:col-span-3">
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
              {t.contracts.save}
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.contracts.colContractNumber}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colTerm}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colInstallment}</th>
              <th className="px-5 py-3 font-medium">{t.contracts.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{c.contractNumber}</td>
                <td className="px-5 py-3 text-slate-500">
                  {pickLocalized(locale, c.unit.property.nameAr, c.unit.property.name)} / {c.unit.unitNumber}
                </td>
                <td className="px-5 py-3">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">
                  {dateFmt.format(c.startDate)} - {dateFmt.format(c.endDate)}
                </td>
                <td className="px-5 py-3">
                  {sar.format(Number(c.rentAmount))}{" "}
                  <span className="text-slate-400 text-xs">/ {t.paymentFrequency[c.paymentFrequency]}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[c.status]}`}>
                    {t.contractStatus[c.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  {c.status === "ACTIVE" && (
                    <form
                      action={async () => {
                        "use server";
                        await terminateContract(c.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.contracts.terminate}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.contracts.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
