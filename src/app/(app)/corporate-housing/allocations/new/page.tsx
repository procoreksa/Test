import { redirect } from "next/navigation";
import { createCorporateAllocation, getEligibleContractsForAccount } from "@/lib/actions/corporate-allocations";
import { getCorporateAccountOptions } from "@/lib/actions/corporate-accounts";
import { listCorporateOccupants } from "@/lib/actions/corporate-occupants";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function NewCorporateAllocationPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; occupantId?: string; contractId?: string }>;
}) {
  const { accountId, occupantId, contractId } = await searchParams;
  const [locale, accounts] = await Promise.all([getLocale(), getCorporateAccountOptions()]);
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    const id = await createCorporateAllocation(formData);
    redirect(`/corporate-housing/allocations/${id}`);
  }

  if (!accountId) {
    return (
      <div className="space-y-6 max-w-xl">
        <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.newAllocationButton}</h1>
        <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldCorporateAccount}</label>
            <select name="accountId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} — {a.displayName}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.corporateHousing.filterApply}</button>
        </form>
      </div>
    );
  }

  const [occupantsResult, contracts] = await Promise.all([
    listCorporateOccupants({ corporateAccountId: accountId }),
    getEligibleContractsForAccount(accountId),
  ]);
  const occupants = occupantsResult.rows;
  const account = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.newAllocationButton}</h1>
        {account && <p className="text-slate-500 text-sm mt-1">{account.accountNumber} — {account.displayName}</p>}
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <input type="hidden" name="corporateAccountId" value={accountId} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldOccupant}</label>
          <select name="occupantId" defaultValue={occupantId ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {occupants.map((o) => (
              <option key={o.id} value={o.id}>
                {pickLocalized(locale, o.fullNameAr, o.fullName)} {o.employeeNumber ? `(${o.employeeNumber})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldContract}</label>
          <select name="contractId" defaultValue={contractId ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contractNumber} — {c.unit.unitNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldStartDate}</label>
            <input type="date" name="startDate" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldPlannedEndDate}</label>
            <input type="date" name="plannedEndDate" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldBedroomNumber}</label>
            <input name="bedroomNumber" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldRoomLabel}</label>
            <input name="roomLabel" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNotes}</label>
          <textarea name="notes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.corporateHousing.createAllocationButton}</button>
      </form>
    </div>
  );
}
