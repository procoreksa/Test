import { classifyCountSeverity, type AttentionItem } from "@/lib/executive/kpi-rules";
import type { ContractsSummary } from "@/lib/executive/leasing";
import type { CollectionsSummary } from "@/lib/executive/collections";
import type { MaintenanceSummary } from "@/lib/executive/maintenance";
import type { CorporateHousingSummary } from "@/lib/executive/corporate-housing";
import type { CommunicationsSummary } from "@/lib/executive/communications";

/**
 * Attention Center (Steps 55-58) - deterministic, non-AI/ML severity rules
 * over KPIs already computed by the other domain modules (no extra queries
 * of its own - purely a synthesis step, matching the target architecture's
 * "Dashboard DTOs -> ... -> Attention Center" ordering). Thresholds are
 * fixed and documented here, never learned/inferred.
 */
export interface AttentionInputs {
  contracts: ContractsSummary;
  collections: CollectionsSummary;
  maintenance: MaintenanceSummary;
  corporateHousing: CorporateHousingSummary;
  communications: CommunicationsSummary;
}

export function buildAttentionItems(input: AttentionInputs): AttentionItem[] {
  const items: AttentionItem[] = [];

  const pastEndDate = classifyCountSeverity(input.contracts.contractsPastEndDate, 1, 5);
  if (pastEndDate) items.push({ key: "contractsPastEndDate", severity: pastEndDate, count: input.contracts.contractsPastEndDate, drillDownRoute: "/contracts" });

  const overdue = classifyCountSeverity(input.collections.overdueReceivablesCount, 1, 10);
  if (overdue) items.push({ key: "overdueReceivables", severity: overdue, count: input.collections.overdueReceivablesCount, drillDownRoute: "/reports/overdue" });

  const agingSevere = classifyCountSeverity(input.collections.aging.bucketCounts.DAYS_90_PLUS, 1, 5);
  if (agingSevere) items.push({ key: "agingSevere", severity: agingSevere, count: input.collections.aging.bucketCounts.DAYS_90_PLUS, drillDownRoute: "/collections" });

  const slaBreached = classifyCountSeverity(input.maintenance.slaBreached, 1, 5);
  if (slaBreached) items.push({ key: "maintenanceSlaBreached", severity: slaBreached, count: input.maintenance.slaBreached, drillDownRoute: "/operations/maintenance/requests" });

  const emergency = classifyCountSeverity(input.maintenance.emergencyRequests, 1, 3);
  if (emergency) items.push({ key: "maintenanceEmergency", severity: emergency, count: input.maintenance.emergencyRequests, drillDownRoute: "/operations/maintenance/requests" });

  const unallocated = classifyCountSeverity(input.corporateHousing.unallocatedCorporateUnits, 1, 5);
  if (unallocated) items.push({ key: "corporateUnallocated", severity: unallocated, count: input.corporateHousing.unallocatedCorporateUnits, drillDownRoute: "/corporate-housing/allocations" });

  const commFailures = classifyCountSeverity(input.communications.failed, 1, 10);
  if (commFailures) items.push({ key: "communicationFailures", severity: commFailures, count: input.communications.failed, drillDownRoute: "/communications/messages" });

  const severityRank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
