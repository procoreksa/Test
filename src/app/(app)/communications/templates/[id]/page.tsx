import Link from "next/link";
import { getCommunicationTemplateById, activateCommunicationTemplate, archiveCommunicationTemplate } from "@/lib/actions/communications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StatusBadge } from "../../status-badge";

export default async function CommunicationTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ template, versionHistory }, role, locale] = await Promise.all([getCommunicationTemplateById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canActivate = can("communicationTemplate.activate", role);
  const canVersion = can("communicationTemplate.create", role) || can("communicationTemplate.version", role);

  async function activate() {
    "use server";
    await activateCommunicationTemplate(id);
  }
  async function archive() {
    "use server";
    await archiveCommunicationTemplate(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/communications/templates" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.communications.templatesTitle}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {template.eventType} / {t.communicationChannel[template.channel]} / {template.language} v{template.version}
            </h1>
            <div className="mt-2">
              <StatusBadge status={template.status} label={t.communicationTemplateStatus[template.status]} />
            </div>
          </div>
          <div className="flex gap-2">
            {canVersion && (
              <Link
                href={`/communications/templates/new?eventType=${template.eventType}&channel=${template.channel}&language=${template.language}`}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 font-semibold text-sm"
              >
                {t.communications.newVersionButton}
              </Link>
            )}
            {canActivate && template.status === "DRAFT" && (
              <form action={activate}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold text-sm">{t.communications.actionActivate}</button>
              </form>
            )}
            {canActivate && template.status !== "ARCHIVED" && (
              <form action={archive}>
                <button className="bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 font-semibold text-sm">{t.communications.actionArchive}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        {template.subject && (
          <div>
            <p className="text-sm text-slate-500">{t.communications.fieldSubject}</p>
            <p className="font-medium text-slate-800">{template.subject}</p>
          </div>
        )}
        <div>
          <p className="text-sm text-slate-500">{t.communications.fieldBodyText}</p>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 rounded-lg p-3 mt-1">{template.bodyText}</pre>
        </div>
        {template.bodyHtml && (
          <div>
            <p className="text-sm text-slate-500">{t.communications.fieldBodyHtml}</p>
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono bg-slate-50 rounded-lg p-3 mt-1">{template.bodyHtml}</pre>
          </div>
        )}
        <div>
          <p className="text-sm text-slate-500">{t.communications.fieldAllowedVariables}</p>
          <p className="text-sm text-slate-700 mt-1">{template.variables.map((v) => `{{${v}}}`).join(", ")}</p>
        </div>
        {template.notes && (
          <div>
            <p className="text-sm text-slate-500">{t.communications.fieldNotes}</p>
            <p className="text-sm text-slate-700 mt-1">{template.notes}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">{t.communications.sectionVersionHistory}</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">{t.communications.colTemplateVersion}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colTemplateStatus}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colCreatedAt}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versionHistory.map((v) => (
                <tr key={v.id} className={v.id === id ? "bg-amber-50" : undefined}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link href={`/communications/templates/${v.id}`} className="hover:underline">
                      v{v.version}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} label={t.communicationTemplateStatus[v.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(v.createdAt).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
