"use server";

import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveExecutiveFilters, type RawExecutiveFilterParams } from "@/lib/executive/filters";
import { toPrismaRange } from "@/lib/executive/date-range";
import { serializeMoney } from "@/lib/executive/format";
import { getPortfolioSummary } from "@/lib/executive/portfolio";
import { getContractsSummary, getLeasingFunnelSummary } from "@/lib/executive/leasing";
import { getCollectionsSummary, type CollectionsSummary } from "@/lib/executive/collections";
import { getOperationsSummary, type OperationsSummary } from "@/lib/executive/operations";
import { getMaintenanceSummary, type MaintenanceSummary } from "@/lib/executive/maintenance";
import { getOwnerFinancialsSummary } from "@/lib/executive/owner-financials";
import { getCorporateHousingSummary } from "@/lib/executive/corporate-housing";
import { getCommunicationsSummary } from "@/lib/executive/communications";
import { getDocumentsSummary } from "@/lib/executive/documents";
import { buildAttentionItems } from "@/lib/executive/attention";
import { prisma } from "@/lib/prisma";

/**
 * Executive Dashboards server actions (Step 100 layer) - the only place
 * `requirePermission` is called for this module. Every domain query module
 * under src/lib/executive/ is permission-agnostic (plain Prisma queries), so
 * this file is the single, auditable gate. Read-only (Critical Principle 7 /
 * Step 92): every action here only ever reads - it deliberately does NOT call
 * syncOverdueStatuses() (unlike getDashboardStats()/getOverdueReport()), so
 * loading an Executive Dashboard never mutates PaymentSchedule/Invoice rows.
 * The tradeoff (documented in docs/EXECUTIVE-DASHBOARDS.md "Read-only
 * decision"): Overdue Receivables here may lag by up to one page-view of
 * /dashboard, /collections, or /reports/overdue elsewhere in the app, which
 * already performs that sync as a side effect of being viewed - an accepted,
 * documented staleness window rather than a mutating "read".
 *
 * Every money (Prisma.Decimal) field is serialized to a fixed-point string
 * here (serializeMoney()) before crossing back into a Server Component -
 * never a bare `number` (see src/lib/executive/format.ts's own doc comment).
 */

function serializeCollections(collections: CollectionsSummary) {
  return {
    invoicedThisPeriod: serializeMoney(collections.invoicedThisPeriod),
    collectedThisPeriod: serializeMoney(collections.collectedThisPeriod),
    collectionRate: collections.collectionRate,
    outstandingReceivables: serializeMoney(collections.outstandingReceivables),
    overdueReceivablesCount: collections.overdueReceivablesCount,
    overdueReceivablesAmount: serializeMoney(collections.overdueReceivablesAmount),
    dueNext7Days: serializeMoney(collections.dueNext7Days),
    dueNext30Days: serializeMoney(collections.dueNext30Days),
    aging: {
      total: serializeMoney(collections.aging.total),
      buckets: Object.fromEntries(Object.entries(collections.aging.buckets).map(([k, v]) => [k, serializeMoney(v)])) as Record<string, string>,
      bucketCounts: collections.aging.bucketCounts,
    },
  };
}

function serializeOperations(operations: OperationsSummary) {
  return {
    moveInsToday: operations.moveInsToday,
    moveInsUpcomingWeek: operations.moveInsUpcomingWeek,
    moveOutsToday: operations.moveOutsToday,
    moveOutsUpcomingWeek: operations.moveOutsUpcomingWeek,
    overdueMoveIns: operations.overdueMoveIns,
    overdueMoveOuts: operations.overdueMoveOuts,
    pendingSettlements: operations.pendingSettlements,
    refundsDueCount: operations.refundsDueCount,
    refundAmountOutstanding: serializeMoney(operations.refundAmountOutstanding),
  };
}

function serializeMaintenance(maintenance: MaintenanceSummary) {
  return {
    openRequests: maintenance.openRequests,
    emergencyRequests: maintenance.emergencyRequests,
    slaBreached: maintenance.slaBreached,
    workOrdersInProgress: maintenance.workOrdersInProgress,
    maintenanceCostThisPeriod: maintenance.maintenanceCostThisPeriod === null ? null : serializeMoney(maintenance.maintenanceCostThisPeriod),
  };
}

export async function getExecutiveOverview(rawFilters: RawExecutiveFilterParams) {
  const { organizationId, role } = await requirePermission("executiveDashboard.view");
  const now = new Date();
  const filters = await resolveExecutiveFilters(organizationId, rawFilters, now);
  const period = toPrismaRange(filters.range);
  const locationScope = { compoundId: filters.compoundId, buildingId: filters.buildingId };

  const canFinancials = can("executiveFinancials.view", role);
  const canOperations = can("executiveOperations.view", role);
  const canMaintenance = can("executiveMaintenance.view", role);
  const canOwnerFinancials = can("executiveOwnerFinancials.view", role);
  const canCorporateHousing = can("executiveCorporateHousing.view", role);
  const costVisible = can("maintenance.cost.view", role);

  const [portfolio, contracts, leasingFunnel, collections, operations, maintenance, ownerFinancials, corporateHousing, communications, documents] = await Promise.all([
    getPortfolioSummary(organizationId, locationScope),
    getContractsSummary(organizationId, locationScope, now),
    getLeasingFunnelSummary(organizationId, period),
    canFinancials ? getCollectionsSummary(organizationId, period, locationScope, now) : null,
    canOperations ? getOperationsSummary(organizationId, locationScope, now) : null,
    canMaintenance ? getMaintenanceSummary(organizationId, period, locationScope, costVisible) : null,
    canOwnerFinancials ? getOwnerFinancialsSummary(organizationId, period) : null,
    canCorporateHousing ? getCorporateHousingSummary(organizationId) : null,
    canOperations ? getCommunicationsSummary(organizationId, period) : null,
    getDocumentsSummary(organizationId),
  ]);

  const attention =
    collections && maintenance && corporateHousing && communications
      ? buildAttentionItems({ contracts, collections, maintenance, corporateHousing, communications })
      : [];

  return {
    filters: { preset: filters.range.preset, compoundId: filters.compoundId, buildingId: filters.buildingId },
    portfolio,
    contracts,
    leasingFunnel,
    collections: collections ? serializeCollections(collections) : null,
    operations: operations ? serializeOperations(operations) : null,
    maintenance: maintenance ? serializeMaintenance(maintenance) : null,
    ownerFinancials: ownerFinancials
      ? {
          balance: serializeMoney(ownerFinancials.balance),
          totalIncome: serializeMoney(ownerFinancials.totalIncome),
          totalExpenses: serializeMoney(ownerFinancials.totalExpenses),
          totalDistributions: serializeMoney(ownerFinancials.totalDistributions),
        }
      : null,
    corporateHousing,
    communications,
    documents,
    attention,
  };
}

export async function getExecutivePropertiesReport(rawFilters: RawExecutiveFilterParams) {
  const { organizationId } = await requirePermission("executiveDashboard.view");
  const filters = await resolveExecutiveFilters(organizationId, rawFilters);
  return getPortfolioSummary(organizationId, { compoundId: filters.compoundId, buildingId: filters.buildingId });
}

export async function getExecutiveCollectionsDetail(rawFilters: RawExecutiveFilterParams) {
  const { organizationId } = await requirePermission("executiveFinancials.view");
  const now = new Date();
  const filters = await resolveExecutiveFilters(organizationId, rawFilters, now);
  const collections = await getCollectionsSummary(organizationId, toPrismaRange(filters.range), { compoundId: filters.compoundId, buildingId: filters.buildingId }, now);
  return serializeCollections(collections);
}

export async function getExecutiveOperationsDetail(rawFilters: RawExecutiveFilterParams) {
  const { organizationId } = await requirePermission("executiveOperations.view");
  const now = new Date();
  const filters = await resolveExecutiveFilters(organizationId, rawFilters, now);
  const operations = await getOperationsSummary(organizationId, { compoundId: filters.compoundId, buildingId: filters.buildingId }, now);
  return serializeOperations(operations);
}

export async function getExecutiveMaintenanceDetail(rawFilters: RawExecutiveFilterParams) {
  const { organizationId, role } = await requirePermission("executiveMaintenance.view");
  const now = new Date();
  const filters = await resolveExecutiveFilters(organizationId, rawFilters, now);
  const costVisible = can("maintenance.cost.view", role);
  const maintenance = await getMaintenanceSummary(organizationId, toPrismaRange(filters.range), { compoundId: filters.compoundId, buildingId: filters.buildingId }, costVisible);
  return serializeMaintenance(maintenance);
}

export async function getCompoundBuildingOptions() {
  const { organizationId } = await requirePermission("executiveDashboard.view");
  const [compounds, buildings] = await Promise.all([
    prisma.compound.findMany({ where: { organizationId }, select: { id: true, name: true, arabicName: true }, orderBy: { name: "asc" } }),
    prisma.building.findMany({ where: { organizationId }, select: { id: true, name: true, nameAr: true, compoundId: true }, orderBy: { name: "asc" } }),
  ]);
  return { compounds, buildings };
}
