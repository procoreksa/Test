import { getTenantProfile, updateTenantContactPhone, changeTenantPassword } from "@/lib/actions/portal/profile";
import { getLocale, getDictionary, longDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function TenantProfilePage() {
  const [{ renter, account, isCorporate }, locale] = await Promise.all([getTenantProfile(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.profileTitle}</h1>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t.tenantPortal.fieldFullName}</dt>
            <dd className="text-slate-800 font-medium">{pickLocalized(locale, renter.fullNameAr, renter.fullName)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.tenantPortal.fieldEmail}</dt>
            <dd className="text-slate-800 font-medium">{account.email}</dd>
          </div>
          {isCorporate && (
            <div>
              <dt className="text-slate-500">{t.tenantPortal.fieldCompany}</dt>
              <dd className="text-slate-800 font-medium">{renter.vatNumber}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">{t.renters.fieldIdType}</dt>
            <dd className="text-slate-800 font-medium">{t.idType[renter.idType]}</dd>
          </div>
          {account.lastLoginAt && (
            <div>
              <dt className="text-slate-500">{t.tenantPortal.lastLoginLabel}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(account.lastLoginAt)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.contactPhoneLabel}</h2>
        <form action={updateTenantContactPhone} className="flex flex-col sm:flex-row gap-3">
          <input
            name="phone"
            type="tel"
            defaultValue={account.phone ?? renter.phone ?? ""}
            required
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.tenantPortal.saveButton}</button>
        </form>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.changePasswordTitle}</h2>
        <form action={changeTenantPassword} className="space-y-3 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldCurrentPassword}</label>
            <input name="currentPassword" type="password" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldNewPassword}</label>
            <input name="newPassword" type="password" required minLength={8} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.tenantPortal.changePasswordButton}</button>
        </form>
      </section>
    </div>
  );
}
