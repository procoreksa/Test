import type { Dictionary } from "@/lib/i18n";
import type { AutomationJobStatus, AutomationJobType, CommunicationOutboxEventStatus } from "@prisma/client";

/** Human-readable label for each AutomationJobType - never the raw enum value in the UI. */
export function automationJobTypeLabel(t: Dictionary, jobType: AutomationJobType): string {
  const map: Record<AutomationJobType, string> = {
    RENT_DUE_REMINDER: t.automation.jobTypeRentDueReminder,
    CONTRACT_EXPIRY_REMINDER: t.automation.jobTypeContractExpiryReminder,
    MOVE_IN_REMINDER: t.automation.jobTypeMoveInReminder,
    MOVE_OUT_REMINDER: t.automation.jobTypeMoveOutReminder,
    MAINTENANCE_SLA_CHECK: t.automation.jobTypeMaintenanceSlaCheck,
    COMMUNICATION_RECONCILIATION: t.automation.jobTypeCommunicationReconciliation,
  };
  return map[jobType];
}

/** AutomationJob's PENDING/RUNNING/COMPLETED/FAILED/CANCELLED map directly onto the glossary terms. */
export function automationJobStatusLabel(t: Dictionary, status: AutomationJobStatus): string {
  const map: Record<AutomationJobStatus, string> = {
    PENDING: t.automation.statusPending,
    RUNNING: t.automation.statusRunning,
    COMPLETED: t.automation.statusCompleted,
    FAILED: t.automation.statusFailed,
    CANCELLED: t.automation.statusCancelled,
  };
  return map[status];
}

/** CommunicationOutboxEvent's own PENDING/PROCESSING/PROCESSED/FAILED reuse the same glossary terms - one word per concept, never two. */
export function outboxEventStatusLabel(t: Dictionary, status: CommunicationOutboxEventStatus): string {
  const map: Record<CommunicationOutboxEventStatus, string> = {
    PENDING: t.automation.statusPending,
    PROCESSING: t.automation.statusRunning,
    PROCESSED: t.automation.statusCompleted,
    FAILED: t.automation.statusFailed,
  };
  return map[status];
}

export function AutomationStatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "COMPLETED" || status === "PROCESSED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "FAILED"
        ? "bg-red-100 text-red-700"
        : status === "CANCELLED"
          ? "bg-slate-100 text-slate-500"
          : status === "RUNNING" || status === "PROCESSING"
            ? "bg-sky-100 text-sky-700"
            : "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
