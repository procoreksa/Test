import Link from "next/link";
import { listCommunicationRules, setCommunicationRuleEnabled } from "@/lib/actions/communications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CommunicationRulesPage() {
  const [rules, role, locale] = await Promise.all([listCommunicationRules(), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canCreate = can("communicationRule.create", role);
  const canUpdate = can("communicationRule.update", role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.communications.rulesTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.communications.rulesSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/communications/rules/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.communications.newRuleButton}
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.communications.colRuleEvent}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colRuleChannel}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colRuleStrategy}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colRuleEnabled}</th>
              {canUpdate && <th className="px-4 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((rule) => {
              async function toggle() {
                "use server";
                await setCommunicationRuleEnabled(rule.id, !rule.isEnabled);
              }
              return (
                <tr key={rule.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{rule.eventType}</td>
                  <td className="px-4 py-3 text-slate-700">{t.communicationChannel[rule.channel]}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.communicationRecipientStrategy[rule.recipientStrategy]}
                    {rule.specificUser ? ` (${rule.specificUser.name})` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${rule.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {rule.isEnabled ? t.communicationTemplateStatus.ACTIVE : t.communications.actionDisable}
                    </span>
                  </td>
                  {canUpdate && (
                    <td className="px-4 py-3 text-right">
                      <form action={toggle}>
                        <button className="text-xs font-semibold text-brand-gold-dark hover:underline">
                          {rule.isEnabled ? t.communications.actionDisable : t.communications.actionEnable}
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.communications.emptyRules}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
