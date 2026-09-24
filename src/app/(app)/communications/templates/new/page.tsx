import { redirect } from "next/navigation";
import Link from "next/link";
import { createCommunicationTemplateVersion, listCommunicationEventDefinitions } from "@/lib/actions/communications";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function NewCommunicationTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ eventType?: string; channel?: string; language?: string }>;
}) {
  const [events, locale, params] = await Promise.all([listCommunicationEventDefinitions(), getLocale(), searchParams]);
  const t = getDictionary(locale);

  async function create(formData: FormData) {
    "use server";
    const id = await createCommunicationTemplateVersion(formData);
    redirect(`/communications/templates/${id}`);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/communications/templates" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.communications.templatesTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.communications.createTemplateTitle}</h1>
      </div>

      <form action={create} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldEventType}</label>
            <select name="eventType" required defaultValue={params.eventType} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {events.map((e) => (
                <option key={e.eventType} value={e.eventType}>
                  {e.eventType}
                  {e.wired ? "" : " (unwired)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldChannel}</label>
            <select name="channel" required defaultValue={params.channel ?? "EMAIL"} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="EMAIL">{t.communicationChannel.EMAIL}</option>
              <option value="WHATSAPP">{t.communicationChannel.WHATSAPP}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldTemplateLanguage}</label>
            <select name="language" required defaultValue={params.language ?? "en"} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldSubject}</label>
          <input name="subject" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldBodyText}</label>
          <textarea name="bodyText" required rows={6} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldBodyHtml}</label>
          <textarea name="bodyHtml" rows={6} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldNotes}</label>
          <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-500">
          {t.communications.fieldAllowedVariables}:{" "}
          {events.map((e) => (
            <span key={e.eventType} className="block">
              <strong>{e.eventType}</strong>: {e.variables.map((v) => `{{${v}}}`).join(", ")}
            </span>
          ))}
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.communications.saveButton}</button>
      </form>
    </div>
  );
}
