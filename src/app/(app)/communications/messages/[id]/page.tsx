import Link from "next/link";
import { getCommunicationMessageById, retryCommunicationMessage, cancelCommunicationMessage } from "@/lib/actions/communications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StatusBadge } from "../../status-badge";

export default async function CommunicationMessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [message, role, locale] = await Promise.all([getCommunicationMessageById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canRetry = can("communications.retry", role);
  const canCancel = can("communications.cancel", role);

  async function retry() {
    "use server";
    await retryCommunicationMessage(id);
  }
  async function cancel() {
    "use server";
    await cancelCommunicationMessage(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/communications/messages" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.communications.messagesTitle}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t.communications.messageDetailTitle}: {message.eventType}
            </h1>
            <p className="text-slate-500 text-sm mt-1">{new Date(message.createdAt).toLocaleString(locale)}</p>
          </div>
          <div className="flex gap-2">
            {canRetry && message.status === "FAILED" && (
              <form action={retry}>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold text-sm">{t.communications.actionRetry}</button>
              </form>
            )}
            {canCancel && message.status === "QUEUED" && (
              <form action={cancel}>
                <button className="bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 font-semibold text-sm">{t.communications.actionCancel}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.communications.sectionMessageInfo}</h2>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">{t.communications.colStatus}</dt>
            <dd className="mt-1">
              <StatusBadge status={message.status} label={t.communicationMessageStatus[message.status]} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.colChannel}</dt>
            <dd className="mt-1 font-medium text-slate-800">{t.communicationChannel[message.channel]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.fieldLanguage}</dt>
            <dd className="mt-1 font-medium text-slate-800">{message.language}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.fieldDestination}</dt>
            <dd className="mt-1 font-medium text-slate-800">{message.destinationMasked}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.fieldBusinessEntity}</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {message.businessEntityType} / {message.businessEntityId}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.fieldTemplate}</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {message.template ? (
                <Link href={`/communications/templates/${message.template.id}`} className="hover:underline">
                  {message.template.eventType} / {message.template.channel} / {message.template.language} v{message.templateVersion}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.communications.fieldAttemptCount}</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {message.attemptCount} / {message.maxAttempts}
            </dd>
          </div>
          {message.lastErrorMessage && (
            <div className="md:col-span-2">
              <dt className="text-slate-500">{t.communications.fieldLastError}</dt>
              <dd className="mt-1 font-medium text-red-700">
                [{message.lastErrorCode}] {message.lastErrorMessage}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.communications.sectionRenderedContent}</h2>
        {message.renderedSubject && (
          <p className="text-sm font-semibold text-slate-800 mb-2">{message.renderedSubject}</p>
        )}
        <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">{message.renderedBody}</pre>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide px-5 pt-5">{t.communications.sectionDeliveryHistory}</h2>
        <table className="w-full text-sm mt-3">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.communications.colAttemptNumber}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colAttemptStatus}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colProvider}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colStartedAt}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colFinishedAt}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colError}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {message.deliveryAttempts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-slate-700">{a.attemptNumber}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} label={a.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">{a.providerName}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(a.startedAt).toLocaleString(locale)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(a.finishedAt).toLocaleString(locale)}</td>
                <td className="px-4 py-3 text-red-600">{a.errorMessage ?? "—"}</td>
              </tr>
            ))}
            {message.deliveryAttempts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.communications.emptyDeliveryAttempts}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
