import Link from "next/link";
import { listOwners, createOwner, deactivateOwner, reactivateOwner } from "@/lib/actions/owners";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [owners, locale, role, { q }] = await Promise.all([listOwners(), getLocale(), getCurrentUserRole(), searchParams]);
  const t = getDictionary(locale);
  const canCreate = can("owner.create", role);
  const canUpdate = can("owner.update", role);

  const query = (q ?? "").trim().toLowerCase();
  const filtered = query
    ? owners.filter((o) =>
        [o.name, o.nameAr, o.mobile, o.nationalId, o.iqamaNumber, o.companyRegistrationNumber]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(query))
      )
    : owners;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.owners.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.owners.subtitle}</p>
      </div>

      <form className="max-w-md">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.owners.searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.owners.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createOwner} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.owners.fieldOwnerType}</label>
              <select name="ownerType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.ownerType) as Array<keyof typeof t.ownerType>).map((value) => (
                  <option key={value} value={value}>
                    {t.ownerType[value]}
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.owners.fieldName} name="name" required />
            <Field label={t.owners.fieldNameAr} name="nameAr" />
            <Field label={t.owners.fieldNationalId} name="nationalId" />
            <Field label={t.owners.fieldIqamaNumber} name="iqamaNumber" />
            <Field label={t.owners.fieldPassportNumber} name="passportNumber" />
            <Field label={t.owners.fieldCompanyRegistrationNumber} name="companyRegistrationNumber" />
            <Field label={t.owners.fieldVatNumber} name="vatNumber" />
            <Field label={t.owners.fieldEmail} name="email" type="email" />
            <Field label={t.owners.fieldMobile} name="mobile" />
            <Field label={t.owners.fieldAlternateMobile} name="alternateMobile" />
            <Field label={t.owners.fieldAddress} name="address" />
            <Field label={t.owners.fieldCity} name="city" />
            <Field label={t.owners.fieldCountry} name="country" />
            <Field label={t.owners.fieldBankName} name="bankName" />
            <Field label={t.owners.fieldBankAccountName} name="bankAccountName" />
            <Field label={t.owners.fieldIban} name="iban" />
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.owners.fieldNotes}</label>
              <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.owners.save}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.owners.colName}</th>
              <th className="px-5 py-3 font-medium">{t.owners.colType}</th>
              <th className="px-5 py-3 font-medium">{t.owners.colMobile}</th>
              <th className="px-5 py-3 font-medium">{t.owners.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="px-5 py-3 font-medium text-slate-800">
                  <Link href={`/owners/${o.id}`} className="hover:underline">
                    {pickLocalized(locale, o.nameAr, o.name)}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">{t.ownerType[o.ownerType]}</td>
                <td className="px-5 py-3 text-slate-500">{o.mobile ?? t.common.none}</td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${o.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {t.ownerStatus[o.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-left space-x-2 rtl:space-x-reverse">
                  <Link href={`/owners/${o.id}`} className="text-brand-gold-dark hover:underline text-xs font-medium">
                    {t.owners.view}
                  </Link>
                  {canUpdate && o.status === "ACTIVE" && (
                    <form
                      className="inline"
                      action={async () => {
                        "use server";
                        await deactivateOwner(o.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.owners.deactivate}</button>
                    </form>
                  )}
                  {canUpdate && o.status === "INACTIVE" && (
                    <form
                      className="inline"
                      action={async () => {
                        "use server";
                        await reactivateOwner(o.id);
                      }}
                    >
                      <button className="text-emerald-600 hover:underline text-xs">{t.owners.reactivate}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.owners.empty}
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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
