import { sendCommunicationTestMessage, listCommunicationEventDefinitions } from "@/lib/actions/communications";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CommunicationTestSendPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const [events, locale, params] = await Promise.all([listCommunicationEventDefinitions(), getLocale(), searchParams]);
  const t = getDictionary(locale);

  async function send(formData: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    try {
      const result = await sendCommunicationTestMessage(formData);
      redirect(`/communications/test-send?result=${result.success ? "success" : "failure"}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error; // rethrow Next.js redirect
      redirect(`/communications/test-send?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.communications.testSendTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.communications.testSendSubtitle}</p>
      </div>

      {params.result === "success" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-4 text-sm">{t.communications.testSendSuccess}</div>
      )}
      {params.result === "failure" && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{t.communications.testSendFailure}</div>
      )}
      {params.error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{decodeURIComponent(params.error)}</div>}

      <form action={send} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldEventType}</label>
            <select name="eventType" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {events.filter((e) => e.wired).map((e) => (
                <option key={e.eventType} value={e.eventType}>
                  {e.eventType}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldTemplateLanguage}</label>
            <select name="language" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.fieldTestDestination}</label>
          <input name="destination" required placeholder="name@example.com or +9665xxxxxxxx" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <p className="text-xs text-slate-400 mt-1">
            Mock provider: include &quot;mockpermfail&quot; or &quot;mockretryfail&quot; in the destination to force a deterministic failure.
          </p>
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.communications.testSendButton}</button>
      </form>
    </div>
  );
}
