import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildAttentionItems } from "@/lib/executive/attention";
import type { ContractsSummary } from "@/lib/executive/leasing";
import type { CollectionsSummary } from "@/lib/executive/collections";
import type { MaintenanceSummary } from "@/lib/executive/maintenance";
import type { CorporateHousingSummary } from "@/lib/executive/corporate-housing";
import type { CommunicationsSummary } from "@/lib/executive/communications";

function baseInputs() {
  const contracts: ContractsSummary = { activeContracts: 10, contractsExpiring30: 0, contractsExpiring60: 0, contractsExpiring90: 0, contractsPastEndDate: 0 };
  const collections: CollectionsSummary = {
    invoicedThisPeriod: new Prisma.Decimal(0),
    collectedThisPeriod: new Prisma.Decimal(0),
    collectionRate: 0,
    outstandingReceivables: new Prisma.Decimal(0),
    overdueReceivablesCount: 0,
    overdueReceivablesAmount: new Prisma.Decimal(0),
    dueNext7Days: new Prisma.Decimal(0),
    dueNext30Days: new Prisma.Decimal(0),
    aging: {
      buckets: { CURRENT: new Prisma.Decimal(0), DAYS_1_30: new Prisma.Decimal(0), DAYS_31_60: new Prisma.Decimal(0), DAYS_61_90: new Prisma.Decimal(0), DAYS_90_PLUS: new Prisma.Decimal(0), UNDATED: new Prisma.Decimal(0) },
      bucketCounts: { CURRENT: 0, DAYS_1_30: 0, DAYS_31_60: 0, DAYS_61_90: 0, DAYS_90_PLUS: 0, UNDATED: 0 },
      total: new Prisma.Decimal(0),
    },
  };
  const maintenance: MaintenanceSummary = { openRequests: 0, emergencyRequests: 0, slaBreached: 0, workOrdersInProgress: 0, maintenanceCostThisPeriod: new Prisma.Decimal(0) };
  const corporateHousing: CorporateHousingSummary = { corporateLeasedUnits: 0, activeCorporateOccupants: 0, activeAllocations: 0, unallocatedCorporateUnits: 0, allocationRate: 0 };
  const communications: CommunicationsSummary = { sent: 0, delivered: 0, failed: 0, deliveryRate: 0 };
  return { contracts, collections, maintenance, corporateHousing, communications };
}

describe("buildAttentionItems", () => {
  it("returns no items when every input is clean", () => {
    expect(buildAttentionItems(baseInputs())).toEqual([]);
  });

  it("surfaces contracts past their end date", () => {
    const input = baseInputs();
    input.contracts = { ...input.contracts, contractsPastEndDate: 2 };
    const items = buildAttentionItems(input);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "contractsPastEndDate", severity: "WARNING", count: 2 });
  });

  it("sorts CRITICAL items before WARNING items", () => {
    const input = baseInputs();
    input.contracts = { ...input.contracts, contractsPastEndDate: 1 }; // WARNING (< 5)
    input.maintenance = { ...input.maintenance, slaBreached: 10 }; // CRITICAL (>= 5)
    const items = buildAttentionItems(input);
    expect(items.map((i) => i.severity)).toEqual(["CRITICAL", "WARNING"]);
  });

  it("never surfaces an item for a count of zero", () => {
    const input = baseInputs();
    input.communications = { ...input.communications, failed: 0 };
    expect(buildAttentionItems(input).find((i) => i.key === "communicationFailures")).toBeUndefined();
  });
});
