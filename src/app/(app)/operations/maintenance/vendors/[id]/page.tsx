import Link from "next/link";
import { getVendorById, updateVendor, setVendorActive } from "@/lib/actions/maintenance";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceCategory } from "@prisma/client";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor, role, locale] = await Promise.all([getVendorById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canManage = can("maintenance.vendor.manage", role);
  const selectedSpecialties = new Set(vendor.specialties.map((s) => s.category));

  async function save(formData: FormData) {
    "use server";
    await updateVendor(id, formData);
  }
  async function toggleActive() {
    "use server";
    await setVendorActive(id, !vendor.active);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/maintenance/vendors" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.vendorsListTitle}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{vendor.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{vendor.vendorNumber}</p>
          </div>
          {canManage && (
            <form action={toggleActive}>
              <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${vendor.active ? "bg-red-50 hover:bg-red-100 text-red-700" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"}`}>
                {vendor.active ? t.maintenance.deactivateButton : t.maintenance.activateButton}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-4">{t.maintenance.newVendorTitle}</h2>
          {canManage ? (
            <form action={save} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldVendorName}</label>
                  <input name="name" defaultValue={vendor.name} required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldVendorNameAr}</label>
                  <input name="nameAr" dir="rtl" defaultValue={vendor.nameAr ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldContactPerson}</label>
                  <input name="contactPerson" defaultValue={vendor.contactPerson ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldPhone}</label>
                  <input name="phone" defaultValue={vendor.phone ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldEmail}</label>
                  <input type="email" name="email" defaultValue={vendor.email ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldSpecialties}</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="specialties" value={v} defaultChecked={selectedSpecialties.has(v)} className="rounded border-slate-300" />
                      {t.maintenanceCategory[v]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldNotes}</label>
                <textarea name="notes" rows={3} defaultValue={vendor.notes ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.maintenance.saveButton}</button>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">{t.maintenance.fieldContactPerson}</dt>
                <dd className="text-slate-800 font-medium">{vendor.contactPerson ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t.maintenance.fieldPhone}</dt>
                <dd className="text-slate-800 font-medium">{vendor.phone ?? "—"}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-4">{t.maintenance.workOrdersListTitle}</h2>
          <ul className="space-y-2">
            {vendor.workOrders.map((wo) => (
              <li key={wo.id}>
                <Link href={`/operations/maintenance/work-orders/${wo.id}`} className="text-sm text-brand-gold-dark hover:underline">
                  {wo.workOrderNumber} — {wo.request.title}
                </Link>
              </li>
            ))}
            {vendor.workOrders.length === 0 && <li className="text-sm text-slate-400">{t.maintenance.empty}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
