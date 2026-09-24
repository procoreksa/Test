import Link from "next/link";
import { listOutboxEvents, retryOutboxEvent } from "@/lib/actions/automation";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { AutomationStatusBadge, outboxEventStatusLabel } from "../status-badge";
import type { CommunicationOutboxEventStatus } from "@prisma/client";

const OUTBOX_STATUSES: CommunicationOutboxEventStatus[] = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"];

export default async function AutomationOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canRetry = can("automation.outbox.retry", role);
  const page = Number(params.page) || 1;

  const { rows, totalPages } = await listOutboxEvents({
    status: (params.status as CommunicationOutboxEventStatus) || undefined,
    page,
  });

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    qs.set("page", String(targetPage));
    return `/automation/outbox?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.automation.outboxTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.automation.outboxSubtitle}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.automation.colOutboxStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.automation.filterStatusAll}</option>
            {OUTBOX_STATUSES.map((s) => (
              <option key={s} value={s}>
                {outboxEventStatusLabel(t, s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold w-full">{t.automation.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.automation.colEvent}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colOutboxStatus}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colOutboxAttempts}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colAvailableAt}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colOutboxLastError}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colCreatedAt}</th>
              {canRetry && <th className="px-4 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((event) => {
              async function retry() {
                "use server";
                await retryOutboxEvent(event.id);
              }
              return (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{event.eventType}</td>
                  <td className="px-4 py-3">
                    <AutomationStatusBadge status={event.status} label={outboxEventStatusLabel(t, event.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {event.attemptCount}/{event.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(event.availableAt).toLocaleString(locale)}</td>
                  <td className="px-4 py-3 text-red-600 max-w-xs truncate">{event.lastErrorMessage ?? ""}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(event.createdAt).toLocaleString(locale)}</td>
                  {canRetry && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {event.status === "FAILED" && (
                        <form action={retry}>
                          <button className="text-xs font-semibold text-brand-gold-dark hover:underline">{t.automation.actionRetryOutbox}</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.automation.emptyOutbox}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.automation.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.automation.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.automation.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
