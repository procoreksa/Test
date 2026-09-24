/**
 * Central, code-level KPI metadata catalog (Step 2/3) - the single place
 * that names every Executive Dashboard metric, its owning domain, whether it
 * is a point-in-time snapshot or a period total, whether it is a money
 * value, and which existing page a click on it drills into. This is
 * metadata only (title/description dictionary keys + routing) - it never
 * contains a formula or a query; the formulas live in the domain modules
 * next to it (portfolio.ts, collections.ts, ...), each of which reuses an
 * existing authoritative function wherever one already exists (see each
 * module's own doc comment for its source).
 *
 * Never an executable SQL string, and never rendered as raw implementation
 * detail to a user - the UI looks up `titleKey`/`descriptionKey` in the
 * current locale's dictionary (`t.executive.kpiInfo[key]`) for the
 * KPI-definition tooltip (Step 76), so a manager sees "Occupancy Rate =
 * Occupied Units / Total Units" in their own language, never a table/column
 * name.
 */
export type ExecutiveDomain =
  | "PORTFOLIO"
  | "LEASING"
  | "CONTRACTS"
  | "COLLECTIONS"
  | "OPERATIONS"
  | "MAINTENANCE"
  | "SECURITY_DEPOSIT"
  | "CORPORATE_HOUSING"
  | "OWNER_FINANCIALS"
  | "COMMUNICATIONS"
  | "DOCUMENTS";

export type KpiMeasurement = "SNAPSHOT" | "PERIOD";

export interface KpiDefinition {
  key: string;
  domain: ExecutiveDomain;
  measurement: KpiMeasurement;
  isMoney: boolean;
  /** Whether the PERIOD filter applies to this KPI - always false for SNAPSHOT (Critical Principle 4: never silently date-filter a snapshot metric). */
  periodFilterable: boolean;
  drillDownRoute: string;
}

export const KPI_REGISTRY: readonly KpiDefinition[] = [
  { key: "totalUnits", domain: "PORTFOLIO", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/units" },
  { key: "occupiedUnits", domain: "PORTFOLIO", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/units" },
  { key: "vacantUnits", domain: "PORTFOLIO", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/units" },
  { key: "occupancyRate", domain: "PORTFOLIO", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/executive/properties" },

  { key: "activeContracts", domain: "CONTRACTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/contracts" },
  { key: "contractsExpiring30", domain: "CONTRACTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/reports/expiring-contracts" },
  { key: "contractsExpiring60", domain: "CONTRACTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/reports/expiring-contracts" },
  { key: "contractsExpiring90", domain: "CONTRACTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/reports/expiring-contracts" },
  { key: "contractsPastEndDate", domain: "CONTRACTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/contracts" },

  { key: "leadsNew", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/crm/leads" },
  { key: "leadConversionRate", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/crm/reports" },
  { key: "viewingsCompleted", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/crm/viewings" },
  { key: "offersAccepted", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/crm/offers" },
  { key: "reservationsConfirmed", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/crm/reservations" },
  { key: "contractsSigned", domain: "LEASING", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/contracts" },

  { key: "invoicedThisPeriod", domain: "COLLECTIONS", measurement: "PERIOD", isMoney: true, periodFilterable: true, drillDownRoute: "/invoices" },
  { key: "collectedThisPeriod", domain: "COLLECTIONS", measurement: "PERIOD", isMoney: true, periodFilterable: true, drillDownRoute: "/payments" },
  { key: "collectionRate", domain: "COLLECTIONS", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/reports/collections" },
  { key: "outstandingReceivables", domain: "COLLECTIONS", measurement: "SNAPSHOT", isMoney: true, periodFilterable: false, drillDownRoute: "/collections" },
  { key: "overdueReceivables", domain: "COLLECTIONS", measurement: "SNAPSHOT", isMoney: true, periodFilterable: false, drillDownRoute: "/reports/overdue" },
  { key: "dueNext7Days", domain: "COLLECTIONS", measurement: "SNAPSHOT", isMoney: true, periodFilterable: false, drillDownRoute: "/collections" },
  { key: "dueNext30Days", domain: "COLLECTIONS", measurement: "SNAPSHOT", isMoney: true, periodFilterable: false, drillDownRoute: "/collections" },

  { key: "moveInsUpcoming", domain: "OPERATIONS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/operations/move-ins" },
  { key: "moveOutsUpcoming", domain: "OPERATIONS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/operations/move-outs" },
  { key: "pendingSettlements", domain: "SECURITY_DEPOSIT", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/operations/settlements" },

  { key: "openMaintenanceRequests", domain: "MAINTENANCE", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/operations/maintenance/requests" },
  { key: "overdueMaintenanceSla", domain: "MAINTENANCE", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/operations/maintenance/requests" },
  { key: "maintenanceCostThisPeriod", domain: "MAINTENANCE", measurement: "PERIOD", isMoney: true, periodFilterable: true, drillDownRoute: "/operations/maintenance/work-orders" },

  { key: "corporateLeasedUnits", domain: "CORPORATE_HOUSING", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/corporate-housing" },
  { key: "activeCorporateOccupants", domain: "CORPORATE_HOUSING", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/corporate-housing/occupants" },
  { key: "corporateAllocationRate", domain: "CORPORATE_HOUSING", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/corporate-housing/allocations" },

  { key: "ownerNetIncomeThisPeriod", domain: "OWNER_FINANCIALS", measurement: "PERIOD", isMoney: true, periodFilterable: true, drillDownRoute: "/reports/owner-statement" },
  { key: "ownerExpensesThisPeriod", domain: "OWNER_FINANCIALS", measurement: "PERIOD", isMoney: true, periodFilterable: true, drillDownRoute: "/reports/owner-statement" },

  { key: "communicationFailures", domain: "COMMUNICATIONS", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/communications/messages" },
  { key: "communicationDeliveryRate", domain: "COMMUNICATIONS", measurement: "PERIOD", isMoney: false, periodFilterable: true, drillDownRoute: "/communications" },

  { key: "activeDocuments", domain: "DOCUMENTS", measurement: "SNAPSHOT", isMoney: false, periodFilterable: false, drillDownRoute: "/documents" },
] as const;

export function getKpiDefinition(key: string): KpiDefinition | undefined {
  return KPI_REGISTRY.find((k) => k.key === key);
}
