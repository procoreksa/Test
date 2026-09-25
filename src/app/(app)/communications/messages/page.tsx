import Link from "next/link";
import { listCommunicationMessages, retryCommunicationMessage, cancelCommunicationMessage } from "@/lib/actions/communications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StatusBadge } from "../status-badge";
import type { CommunicationChannel, CommunicationEventType, CommunicationMessageStatus } from "@prisma/client";

export default async function CommunicationMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; eventType?: string }>;
}) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canRetry = can("communications.retry", role);
  const canCancel = can("communications.cancel", role);

  const messages = await listCommunicationMessages({
    status: (params.status as CommunicationMessageStatus) || undefined,
    channel: (params.channel as CommunicationChannel) || undefined,
    eventType: (params.eventType as CommunicationEventType) || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.communications.messagesTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.communications.messagesSubtitle}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.colStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.communications.filterAll}</option>
            {(Object.keys(t.communicationMessageStatus) as CommunicationMessageStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.communicationMessageStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.communications.colChannel}</label>
          <select name="channel" defaultValue={params.channel ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.communications.filterAll}</option>
            {(Object.keys(t.communicationChannel) as CommunicationChannel[]).map((v) => (
              <option key={v} value={v}>
                {t.communicationChannel[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold w-full">{t.communications.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.communications.colEvent}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colChannel}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colDestination}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colAttempts}</th>
              <th className="px-4 py-3 font-medium">{t.communications.colCreatedAt}</th>
              {(canRetry || canCancel) && <th className="px-4 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {messages.map((m) => {
              async function retry() {
                "use server";
                await retryCommunicationMessage(m.id);
              }
              async function cancel() {
                "use server";
                await cancelCommunicationMessage(m.id);
              }
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/communications/messages/${m.id}`} className="hover:underline">
                      {m.eventType}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.communicationChannel[m.channel]}</td>
                  <td className="px-4 py-3 text-slate-500">{m.destinationMasked}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.status} label={t.communicationMessageStatus[m.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {m.attemptCount}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleString(locale)}</td>
                  {(canRetry || canCancel) && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2 justify-end">
                        {canRetry && m.status === "FAILED" && (
                          <form action={retry}>
                            <button className="text-xs font-semibold text-brand-gold-dark hover:underline">{t.communications.actionRetry}</button>
                          </form>
                        )}
                        {canCancel && m.status === "QUEUED" && (
                          <form action={cancel}>
                            <button className="text-xs font-semibold text-red-600 hover:underline">{t.communications.actionCancel}</button>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {messages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.communications.emptyMessages}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
