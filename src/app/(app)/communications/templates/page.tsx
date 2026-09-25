import Link from "next/link";
import { listCommunicationTemplates } from "@/lib/actions/communications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StatusBadge } from "../status-badge";

export default async function CommunicationTemplatesPage() {
  const [templates, role, locale] = await Promise.all([listCommunicationTemplates(), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canCreate = can("communicationTemplate.create", role) || can("communicationTemplate.version", role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.communications.templatesTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.communications.templatesSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/communications/templates/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.communications.newTemplateButton}
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.communications.colTemplateEvent}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colTemplateChannel}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colTemplateLanguage}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colTemplateVersion}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colTemplateStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {templates.map((tpl) => (
              <tr key={tpl.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/communications/templates/${tpl.id}`} className="hover:underline">
                    {tpl.eventType}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{t.communicationChannel[tpl.channel]}</td>
                <td className="px-4 py-3 text-slate-500">{tpl.language}</td>
                <td className="px-4 py-3 text-slate-500">v{tpl.version}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={tpl.status} label={t.communicationTemplateStatus[tpl.status]} />
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.communications.emptyTemplates}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
