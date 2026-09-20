import { getOrganization, updateOrganization } from "@/lib/actions/organization";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function SettingsPage() {
  const [org, locale] = await Promise.all([getOrganization(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.settings.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.settings.subtitle}</p>
      </div>

      <form action={updateOrganization} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-slate-300 text-2xl">🏢</span>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.settings.fieldLogo}</label>
            <input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
            <p className="text-xs text-slate-400 mt-1">{t.settings.logoHint}</p>
          </div>
        </div>
        <Field label={t.settings.fieldNameEn} name="name" defaultValue={org.name} required />
        <Field label={t.settings.fieldNameAr} name="nameAr" defaultValue={org.nameAr ?? ""} />
        <Field label={t.settings.fieldCommercialRegistration} name="commercialRegistration" defaultValue={org.commercialRegistration ?? ""} />
        <Field label={t.settings.fieldVatNumber} name="vatNumber" defaultValue={org.vatNumber ?? ""} />
        <Field label={t.settings.fieldCity} name="city" defaultValue={org.city ?? ""} />
        <Field label={t.settings.fieldDistrict} name="district" defaultValue={org.district ?? ""} />
        <Field label={t.settings.fieldStreet} name="street" defaultValue={org.street ?? ""} />
        <Field label={t.settings.fieldBuildingNumber} name="buildingNumber" defaultValue={org.buildingNumber ?? ""} />
        <Field label={t.settings.fieldPostalCode} name="postalCode" defaultValue={org.postalCode ?? ""} />
        <Field label={t.settings.fieldPhone} name="phone" defaultValue={org.phone ?? ""} />
        <Field label={t.settings.fieldEmail} name="email" type="email" defaultValue={org.email ?? ""} />
        <div className="md:col-span-2">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.settings.save}
          </button>
        </div>
      </form>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        <p className="font-semibold mb-1">{t.settings.zatcaNoteTitle}</p>
        <p>{t.settings.zatcaNoteBody}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
