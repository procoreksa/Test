import { createVendor } from "@/lib/actions/maintenance";
import { getLocale, getDictionary } from "@/lib/i18n";
import { redirect } from "next/navigation";
import type { MaintenanceCategory } from "@prisma/client";

export default async function NewVendorPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    const id = await createVendor(formData);
    redirect(`/operations/maintenance/vendors/${id}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.newVendorTitle}</h1>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldVendorName}</label>
            <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldVendorNameAr}</label>
            <input name="nameAr" dir="rtl" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldContactPerson}</label>
            <input name="contactPerson" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldPhone}</label>
            <input name="phone" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldEmail}</label>
            <input type="email" name="email" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldSpecialties}</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="specialties" value={v} className="rounded border-slate-300" />
                {t.maintenanceCategory[v]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldNotes}</label>
          <textarea name="notes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.maintenance.createButton}</button>
      </form>
    </div>
  );
}
