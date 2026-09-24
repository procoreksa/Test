import { redirect } from "next/navigation";
import Link from "next/link";
import { createCommunicationRule, listCommunicationEventDefinitions, listAssignableInternalUsers } from "@/lib/actions/communications";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function NewCommunicationRulePage() {
  const [events, users, locale] = await Promise.all([listCommunicationEventDefinitions(), listAssignableInternalUsers(), getLocale()]);
  const t = getDictionary(locale);

  async function create(formData: FormData) {
    "use server";
    await createCommunicationRule(formData);
    redirect("/communications/rules");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/communications/rules" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.communications.rulesTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.communications.createRuleTitle}</h1>
      </div>

      <form action={create} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldEventType}</label>
          <select name="eventType" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
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
          <select name="channel" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="EMAIL">{t.communicationChannel.EMAIL}</option>
            <option value="WHATSAPP">{t.communicationChannel.WHATSAPP}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldRecipientStrategy}</label>
          <select name="recipientStrategy" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {(Object.keys(t.communicationRecipientStrategy) as Array<keyof typeof t.communicationRecipientStrategy>).map((v) => (
              <option key={v} value={v}>
                {t.communicationRecipientStrategy[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldSpecificUser}</label>
          <select name="specificUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.communications.saveButton}</button>
      </form>
    </div>
  );
}
