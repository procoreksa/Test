import { redirect } from "next/navigation";
import Link from "next/link";
import { createTenantMaintenanceRequest } from "@/lib/actions/portal/maintenance";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceCategory, MaintenancePriority } from "@prisma/client";

async function submitAction(formData: FormData) {
  "use server";
  const id = await createTenantMaintenanceRequest(formData);
  redirect(`/portal/maintenance/${id}`);
}

export default async function TenantNewMaintenanceRequestPage() {
  const t = getDictionary(await getLocale());

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/maintenance" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.tenantPortal.maintenanceTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.tenantPortal.newMaintenanceRequestTitle}</h1>
      </div>

      <p className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">{t.tenantPortal.emergencyWarning}</p>

      <form action={submitAction} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldCategory}</label>
            <select name="category" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
                <option key={v} value={v}>
                  {t.maintenanceCategory[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldPriority}</label>
            <select name="priority" defaultValue="NORMAL" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.maintenancePriority) as MaintenancePriority[]).map((v) => (
                <option key={v} value={v}>
                  {t.maintenancePriority[v]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldTitle}</label>
          <input name="title" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldDescription}</label>
          <textarea name="description" rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldPreferredVisitDate}</label>
            <input name="preferredVisitDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.fieldPreferredTimeWindow}</label>
            <input name="preferredTimeWindow" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="permissionToEnter" className="rounded border-slate-300" />
          {t.tenantPortal.fieldPermissionToEnter}
        </label>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.tenantPortal.submitRequestButton}</button>
      </form>
    </div>
  );
}
