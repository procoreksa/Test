import { redirect } from "next/navigation";
import { createCorporateAccount, getEligibleCorporateRenters, getCorporateAccountManagerOptions } from "@/lib/actions/corporate-accounts";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function NewCorporateAccountPage() {
  const [locale, renters, users] = await Promise.all([getLocale(), getEligibleCorporateRenters(), getCorporateAccountManagerOptions()]);
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    const id = await createCorporateAccount(formData);
    redirect(`/corporate-housing/accounts/${id}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.createAccountTitle}</h1>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldCorporateRenter}</label>
          <select name="renterId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {renters.map((r) => (
              <option key={r.id} value={r.id}>
                {pickLocalized(locale, r.fullNameAr, r.fullName)} ({r.vatNumber})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldDisplayName}</label>
          <input name="displayName" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldIndustry}</label>
            <input name="industry" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldWebsite}</label>
            <input name="website" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldAccountManager}</label>
          <select name="accountManagerUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.fieldNotes}</label>
          <textarea name="notes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.corporateHousing.saveButton}</button>
      </form>
    </div>
  );
}
