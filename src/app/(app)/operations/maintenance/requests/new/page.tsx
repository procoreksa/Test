import { createMaintenanceRequest, getMaintenanceLocationTree, getMaintenanceCompoundsAndBuildings } from "@/lib/actions/maintenance";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { MaintenanceUnitPicker } from "@/components/maintenance-unit-picker";
import { redirect } from "next/navigation";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceReportedByType, MaintenanceRequestSource } from "@prisma/client";

export default async function NewMaintenanceRequestPage() {
  const [locale, locationTree, compoundsAndBuildings] = await Promise.all([getLocale(), getMaintenanceLocationTree(), getMaintenanceCompoundsAndBuildings()]);
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    const id = await createMaintenanceRequest(formData);
    redirect(`/operations/maintenance/requests/${id}`);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.newRequestTitle}</h1>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldScopeType}</label>
          <select name="scopeType" defaultValue="UNIT" className="w-full rounded-lg border border-slate-300 px-3 py-2" required>
            <option value="UNIT">{t.maintenanceScopeType.UNIT}</option>
            <option value="BUILDING_COMMON_AREA">{t.maintenanceScopeType.BUILDING_COMMON_AREA}</option>
            <option value="COMPOUND_COMMON_AREA">{t.maintenanceScopeType.COMPOUND_COMMON_AREA}</option>
          </select>
        </div>

        <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-lg p-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">{t.maintenance.sectionLocation}</legend>
          <MaintenanceUnitPicker
            compounds={locationTree}
            locale={locale}
            labels={{ compound: t.maintenance.fieldCompound, building: t.maintenance.fieldBuilding, floor: t.maintenance.fieldFloor, unit: t.maintenance.fieldUnit }}
          />
        </fieldset>

        <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-lg p-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">{t.maintenanceScopeType.BUILDING_COMMON_AREA} / {t.maintenanceScopeType.COMPOUND_COMMON_AREA}</legend>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldCompound}</label>
            <select name="compoundId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {compoundsAndBuildings.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickLocalized(locale, c.arabicName, c.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldBuilding}</label>
            <select name="buildingId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {compoundsAndBuildings.flatMap((c) => c.buildings).map((b) => (
                <option key={b.id} value={b.id}>
                  {pickLocalized(locale, b.nameAr, b.name)}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldCategory}</label>
            <select name="category" className="w-full rounded-lg border border-slate-300 px-3 py-2" required>
              {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
                <option key={v} value={v}>
                  {t.maintenanceCategory[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldPriority}</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldTitle}</label>
          <input name="title" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldDescription}</label>
          <textarea name="description" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldReportedByType}</label>
            <select name="reportedByType" defaultValue="STAFF" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.maintenanceReportedByType) as MaintenanceReportedByType[]).map((v) => (
                <option key={v} value={v}>
                  {t.maintenanceReportedByType[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldReportedByName}</label>
            <input name="reportedByName" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldReportedByPhone}</label>
            <input name="reportedByPhone" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldPreferredVisitDate}</label>
            <input type="date" name="preferredVisitDate" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldPreferredTimeWindow}</label>
            <input name="preferredTimeWindow" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="permissionToEnter" className="rounded border-slate-300" />
              {t.maintenance.fieldPermissionToEnter}
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.fieldSource}</label>
          <select name="source" defaultValue="INTERNAL" className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {(Object.keys(t.maintenanceRequestSource) as MaintenanceRequestSource[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenanceRequestSource[v]}
              </option>
            ))}
          </select>
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold">{t.maintenance.createButton}</button>
      </form>
    </div>
  );
}
