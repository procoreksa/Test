import Link from "next/link";
import { listAutomationJobs, retryAutomationJob, cancelAutomationJob } from "@/lib/actions/automation";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { AutomationStatusBadge, automationJobStatusLabel, automationJobTypeLabel } from "../status-badge";
import type { AutomationJobStatus, AutomationJobType } from "@prisma/client";

const JOB_STATUSES: AutomationJobStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];
const JOB_TYPES: AutomationJobType[] = [
  "RENT_DUE_REMINDER",
  "CONTRACT_EXPIRY_REMINDER",
  "MOVE_IN_REMINDER",
  "MOVE_OUT_REMINDER",
  "MAINTENANCE_SLA_CHECK",
  "COMMUNICATION_RECONCILIATION",
];

export default async function AutomationJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; jobType?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canRetry = can("automation.job.retry", role);
  const canCancel = can("automation.job.cancel", role);
  const page = Number(params.page) || 1;

  const { rows, totalPages } = await listAutomationJobs({
    status: (params.status as AutomationJobStatus) || undefined,
    jobType: (params.jobType as AutomationJobType) || undefined,
    page,
  });

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.jobType) qs.set("jobType", params.jobType);
    qs.set("page", String(targetPage));
    return `/automation/jobs?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.automation.jobsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.automation.jobsSubtitle}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.automation.colStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.automation.filterStatusAll}</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {automationJobStatusLabel(t, s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.automation.colJobType}</label>
          <select name="jobType" defaultValue={params.jobType ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.automation.filterStatusAll}</option>
            {JOB_TYPES.map((jt) => (
              <option key={jt} value={jt}>
                {automationJobTypeLabel(t, jt)}
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
              <th className="px-4 py-3 font-medium">{t.automation.colJobType}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colScheduledFor}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colAttempts}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colLastError}</th>
              <th className="px-4 py-3 font-medium">{t.automation.colCreatedAt}</th>
              {(canRetry || canCancel) && <th className="px-4 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((job) => {
              async function retry() {
                "use server";
                await retryAutomationJob(job.id);
              }
              async function cancel() {
                "use server";
                await cancelAutomationJob(job.id);
              }
              return (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/automation/jobs/${job.id}`} className="hover:underline">
                      {automationJobTypeLabel(t, job.jobType)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AutomationStatusBadge status={job.status} label={automationJobStatusLabel(t, job.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(job.scheduledFor).toLocaleString(locale)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {job.attemptCount}/{job.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-red-600 max-w-xs truncate">{job.lastErrorMessage ?? ""}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(job.createdAt).toLocaleString(locale)}</td>
                  {(canRetry || canCancel) && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2 justify-end">
                        {canRetry && job.status === "FAILED" && (
                          <form action={retry}>
                            <button className="text-xs font-semibold text-brand-gold-dark hover:underline">{t.automation.actionRetryJob}</button>
                          </form>
                        )}
                        {canCancel && job.status === "PENDING" && (
                          <form action={cancel}>
                            <button className="text-xs font-semibold text-red-600 hover:underline">{t.automation.actionCancelJob}</button>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.automation.emptyJobs}
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
