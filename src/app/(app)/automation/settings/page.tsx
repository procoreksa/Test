import { getAutomationSettings, updateAutomationSettings } from "@/lib/actions/automation";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function AutomationSettingsPage() {
  const [settings, role, locale] = await Promise.all([getAutomationSettings(), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canUpdate = can("automation.settings.update", role);

  async function save(formData: FormData) {
    "use server";
    await updateAutomationSettings({
      rentReminderEnabled: formData.get("rentReminderEnabled") === "on",
      contractExpiryReminderEnabled: formData.get("contractExpiryReminderEnabled") === "on",
      moveInReminderEnabled: formData.get("moveInReminderEnabled") === "on",
      moveOutReminderEnabled: formData.get("moveOutReminderEnabled") === "on",
      maintenanceSlaAutomationEnabled: formData.get("maintenanceSlaAutomationEnabled") === "on",
    });
  }

  const toggles: Array<{ name: string; label: string; checked: boolean }> = [
    { name: "rentReminderEnabled", label: t.automation.settingRentDueReminder, checked: settings.rentReminderEnabled },
    { name: "contractExpiryReminderEnabled", label: t.automation.settingContractExpiryReminder, checked: settings.contractExpiryReminderEnabled },
    { name: "moveInReminderEnabled", label: t.automation.settingMoveInReminder, checked: settings.moveInReminderEnabled },
    { name: "moveOutReminderEnabled", label: t.automation.settingMoveOutReminder, checked: settings.moveOutReminderEnabled },
    { name: "maintenanceSlaAutomationEnabled", label: t.automation.settingMaintenanceSlaAutomation, checked: settings.maintenanceSlaAutomationEnabled },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.automation.settingsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.automation.settingsSubtitle}</p>
      </div>

      <form action={canUpdate ? save : undefined} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        {toggles.map((toggle) => (
          <label key={toggle.name} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
            <span className="text-sm font-medium text-slate-700">{toggle.label}</span>
            <input
              type="checkbox"
              name={toggle.name}
              defaultChecked={toggle.checked}
              disabled={!canUpdate}
              className="w-5 h-5 rounded border-slate-300 disabled:opacity-50"
            />
          </label>
        ))}

        <p className="text-xs text-slate-400">
          {settings.updatedAt ? t.automation.settingsLastUpdated(new Date(settings.updatedAt).toLocaleString(locale)) : t.automation.settingsNeverUpdated}
        </p>

        {canUpdate && (
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.automation.settingsSaveButton}
          </button>
        )}
      </form>
    </div>
  );
}
