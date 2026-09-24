import { getAutomationJobById, retryAutomationJob, cancelAutomationJob } from "@/lib/actions/automation";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import { AutomationStatusBadge, automationJobStatusLabel, automationJobTypeLabel } from "../../status-badge";
import type { AutomationJobAttemptOutcome } from "@prisma/client";

function attemptOutcomeLabel(t: Dictionary, outcome: AutomationJobAttemptOutcome | null): string {
  if (!outcome) return "";
  const map: Record<AutomationJobAttemptOutcome, string> = {
    COMPLETED: t.automation.attemptOutcomeCompleted,
    SKIPPED: t.automation.attemptOutcomeSkipped,
    RETRYABLE_FAILURE: t.automation.attemptOutcomeRetryableFailure,
    PERMANENT_FAILURE: t.automation.attemptOutcomePermanentFailure,
  };
  return map[outcome];
}

export default async function AutomationJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, role, locale] = await Promise.all([getAutomationJobById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canRetry = can("automation.job.retry", role);
  const canCancel = can("automation.job.cancel", role);

  async function retry() {
    "use server";
    await retryAutomationJob(id);
  }
  async function cancel() {
    "use server";
    await cancelAutomationJob(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.automation.jobDetailTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{automationJobTypeLabel(t, job.jobType)}</p>
        </div>
        <div className="flex gap-2">
          {canRetry && job.status === "FAILED" && (
            <form action={retry}>
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold text-sm">{t.automation.actionRetryJob}</button>
            </form>
          )}
          {canCancel && job.status === "PENDING" && (
            <form action={cancel}>
              <button className="bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 font-semibold text-sm">{t.automation.actionCancelJob}</button>
            </form>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t.automation.sectionJobInfo}</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label={t.automation.fieldJobType} value={automationJobTypeLabel(t, job.jobType)} />
          <Field label={t.automation.colStatus} value={<AutomationStatusBadge status={job.status} label={automationJobStatusLabel(t, job.status)} />} />
          <Field label={t.automation.fieldJobKey} value={job.jobKey} />
          <Field label={t.automation.fieldScheduledFor} value={new Date(job.scheduledFor).toLocaleString(locale)} />
          <Field label={t.automation.fieldAvailableAt} value={new Date(job.availableAt).toLocaleString(locale)} />
          <Field label={t.automation.fieldAttemptCount} value={String(job.attemptCount)} />
          <Field label={t.automation.fieldMaxAttempts} value={String(job.maxAttempts)} />
          {job.lastErrorMessage && <Field label={t.automation.fieldLastError} value={<span className="text-red-600">{job.lastErrorMessage}</span>} />}
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">{t.automation.sectionAttemptHistory}</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptNumber}</th>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptWorker}</th>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptOutcome}</th>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptStartedAt}</th>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptFinishedAt}</th>
                <th className="px-4 py-3 font-medium">{t.automation.colAttemptError}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {job.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3 text-slate-700">{attempt.attemptNumber}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{attempt.workerId}</td>
                  <td className="px-4 py-3 text-slate-700">{attemptOutcomeLabel(t, attempt.outcome)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(attempt.startedAt).toLocaleString(locale)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{attempt.finishedAt ? new Date(attempt.finishedAt).toLocaleString(locale) : ""}</td>
                  <td className="px-4 py-3 text-red-600 max-w-xs truncate">{attempt.errorMessage ?? ""}</td>
                </tr>
              ))}
              {job.attempts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    {t.automation.emptyAttempts}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 font-medium mt-0.5">{value}</dd>
    </div>
  );
}
