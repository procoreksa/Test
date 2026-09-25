import Link from "next/link";
import { listContracts, createContract, terminateContract } from "@/lib/actions/contracts";
import { listUnits } from "@/lib/actions/units";
import { listRenters } from "@/lib/actions/renters";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ToggleNewEntity } from "@/components/toggle-new-entity";
import { CascadingLocationPicker } from "@/components/cascading-location-picker";
import { getLocationTree } from "@/lib/actions/floors";
import { unitLocationLabel } from "@/lib/unit-location";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  TERMINATED: "bg-red-100 text-red-700",
  RENEWED: "bg-blue-100 text-blue-700",
};

export default async function ContractsPage() {
  const [contracts, units, renters, locationTree, locale, role] = await Promise.all([
    listContracts(),
    listUnits(),
    listRenters(),
    getLocationTree(),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const availableUnits = units.filter((u) => u.status !== "OCCUPIED");
  const canCreate = can("contract.create", role);
  const canUpdate = can("contract.update", role);
  const canRenew = can("contract.renew", role);
  const canTerminate = can("contract.terminate", role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.contracts.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.contracts.subtitle}</p>
      </div>

      {canCreate && (
      <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
          {t.contracts.addNew}
          <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
        </summary>
        <form action={createContract} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <ToggleNewEntity
            flagName="createNewUnit"
            toggleLabel={t.contracts.addNewUnitToggle}
            existing={
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldUnit}</label>
                <select name="unitId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {t.contracts.unitOptionLabel(unitLocationLabel(locale, u), u.unitNumber)}
                    </option>
                  ))}
                </select>
              </div>
            }
            newFields={
              <>
                <CascadingLocationPicker
                  compounds={locationTree}
                  locale={locale}
                  fieldName="newUnitFloorId"
                  labels={{
                    compound: t.locationPicker.compound,
                    building: t.locationPicker.building,
                    floor: t.locationPicker.floor,
                  }}
                />
                <Field label={t.units.fieldUnitNumber} name="newUnitNumber" required />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.units.fieldUnitType}</label>
                  <select name="newUnitType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {(Object.keys(t.unitType) as Array<keyof typeof t.unitType>).map((value) => (
                      <option key={value} value={value}>
                        {t.unitType[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={t.units.fieldBaseRent} name="newUnitBaseRentAmount" type="number" step="0.01" required />
                <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
                  <input type="checkbox" name="newUnitVatApplicable" className="rounded border-slate-300" />
                  {t.units.fieldVatApplicable}
                </label>
              </>
            }
          />
          <ToggleNewEntity
            flagName="createNewRenter"
            toggleLabel={t.contracts.addNewRenterToggle}
            existing={
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
            }
            newFields={
              <>
                <Field label={t.renters.fieldFullName} name="newRenterFullName" required />
                <Field label={t.renters.fieldFullNameAr} name="newRenterFullNameAr" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.renters.fieldIdType}</label>
                  <select name="newRenterIdType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {(Object.keys(t.idType) as Array<keyof typeof t.idType>).map((value) => (
                      <option key={value} value={value}>
                        {t.idType[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={t.renters.fieldIdNumber} name="newRenterIdNumber" />
                <Field label={t.renters.fieldPhone} name="newRenterPhone" />
              </>
            }
          />
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
          <Field label={t.contracts.fieldCommission} name="commissionAmount" type="number" step="0.01" />
          <Field label={t.contracts.fieldCleaning} name="cleaningAmount" type="number" step="0.01" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.contracts.fieldExtraChargesMode}</label>
            <select name="extraChargesMode" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="ONE_TIME">{t.contracts.extraChargesModeOneTime}</option>
              <option value="SPLIT">{t.contracts.extraChargesModeSplit}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
            <input type="checkbox" name="vatApplicable" className="rounded border-slate-300" />
            {t.contracts.fieldVatApplicable}
          </label>
          <p className="md:col-span-3 text-xs text-slate-400 -mt-2">{t.contracts.extraChargesHint}</p>
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
      )}

      {contracts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-8 text-center text-slate-400">
          {t.contracts.empty}
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
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
                      {unitLocationLabel(locale, c.unit)} / {c.unit.unitNumber}
                    </td>
                    <td className="px-5 py-3">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {dateFmt.format(c.startDate)} - {dateFmt.format(c.endDate)}
                    </td>
                    <td className="px-5 py-3">
                      <InstallmentInfo contract={c} t={t} sar={sar} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge contract={c} t={t} />
                    </td>
                    <td className="px-5 py-3 text-left space-y-1">
                      <ContractActions contract={c} t={t} canUpdate={canUpdate} canRenew={canRenew} canTerminate={canTerminate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {contracts.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-slate-800">{c.contractNumber}</div>
                  <StatusBadge contract={c} t={t} />
                </div>
                <div className="mt-1 text-sm text-slate-600 break-words">
                  {unitLocationLabel(locale, c.unit)} / {c.unit.unitNumber}
                </div>
                <div className="text-sm text-slate-600 break-words">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-slate-400 text-xs">{t.contracts.colTerm}</dt>
                    <dd className="text-slate-700 text-xs">
                      {dateFmt.format(c.startDate)} - {dateFmt.format(c.endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 text-xs">{t.contracts.colInstallment}</dt>
                    <dd className="text-slate-700">
                      <InstallmentInfo contract={c} t={t} sar={sar} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                  <ContractActions contract={c} t={t} canUpdate={canUpdate} canRenew={canRenew} canTerminate={canTerminate} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type ContractRow = Awaited<ReturnType<typeof listContracts>>[number];
type Dict = ReturnType<typeof getDictionary>;

function StatusBadge({ contract, t }: { contract: ContractRow; t: Dict }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[contract.status]}`}>
      {t.contractStatus[contract.status]}
    </span>
  );
}

function InstallmentInfo({ contract, t, sar }: { contract: ContractRow; t: Dict; sar: Intl.NumberFormat }) {
  return (
    <>
      {sar.format(Number(contract.rentAmount))}{" "}
      <span className="text-slate-400 text-xs">/ {t.paymentFrequency[contract.paymentFrequency]}</span>
      {(Number(contract.commissionAmount ?? 0) > 0 || Number(contract.cleaningAmount ?? 0) > 0) && (
        <span className="block text-brand-gold-dark text-[11px] font-medium">{t.contracts.extraFeesBadge}</span>
      )}
    </>
  );
}

function ContractActions({
  contract,
  t,
  canUpdate,
  canRenew,
  canTerminate,
}: {
  contract: ContractRow;
  t: Dict;
  canUpdate: boolean;
  canRenew: boolean;
  canTerminate: boolean;
}) {
  return (
    <>
      {canUpdate && contract.status !== "TERMINATED" && contract.status !== "RENEWED" && (
        <Link href={`/contracts/${contract.id}/edit`} className="block text-brand-gold-dark hover:underline text-xs font-medium">
          {t.contracts.edit}
        </Link>
      )}
      {contract.status === "ACTIVE" && (
        <>
          {canRenew && (
            <Link href={`/contracts/${contract.id}/renew`} className="block text-brand-gold-dark hover:underline text-xs font-medium">
              {t.contracts.renew}
            </Link>
          )}
          {canTerminate && (
            <form
              action={async () => {
                "use server";
                await terminateContract(contract.id);
              }}
            >
              <button className="text-red-500 hover:underline text-xs">{t.contracts.terminate}</button>
            </form>
          )}
        </>
      )}
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
