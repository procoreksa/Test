/**
 * Hardening (Step 19 of the hardening brief, docs/SECURITY-REVIEW.md
 * "Ownership concurrency"): a real, database-backed concurrency test
 * proving createOwnership()'s read-total-then-insert check is actually
 * race-safe now that it runs inside a Postgres Serializable transaction
 * (see src/lib/actions/ownership.ts) - mirrors the existing
 * reservation-concurrency.db.test.ts pattern exactly.
 *
 * Two ownership allocations for the SAME asset that together would exceed
 * 100% (60% + 60%) are fired truly concurrently via Promise.allSettled.
 * Under READ COMMITTED (the bug this test guards against), both could read
 * "0% existing" before either commits and both would pass the <=100%
 * check, leaving the asset at 120% ownership. Under Serializable
 * isolation, Postgres must abort one of the two transactions with a
 * serialization failure (Prisma P2034).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { resetDatabase, seedFullOrg, createTestOwner, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { activeOwnershipTotalForAsset } from "@/lib/ownership";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("OWNC");
  mockAuth.mockResolvedValue(org.session);
});

function ownershipFormData(ownerId: string, unitId: string, percentage: number): FormData {
  const fd = new FormData();
  fd.set("ownerId", ownerId);
  fd.set("assetLevel", "UNIT");
  fd.set("assetId", unitId);
  fd.set("ownershipPercentage", String(percentage));
  fd.set("effectiveFrom", "2027-01-01");
  return fd;
}

describe("Ownership concurrency (Step 19): Serializable isolation prevents exceeding 100%", () => {
  it("of two simultaneous 60% allocations on the same Unit, exactly one succeeds and the final total never exceeds 100%", async () => {
    const { createOwnership } = await import("@/lib/actions/ownership");

    const ownerA = await createTestOwner(org.organization.id, "Owner A");
    const ownerB = await createTestOwner(org.organization.id, "Owner B");

    const results = await Promise.allSettled([
      createOwnership(ownershipFormData(ownerA.id, org.reservableUnit.id, 60)),
      createOwnership(ownershipFormData(ownerB.id, org.reservableUnit.id, 60)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rows = await prisma.propertyOwnership.findMany({ where: { organizationId: org.organization.id, unitId: org.reservableUnit.id, status: "ACTIVE" } });
    expect(rows).toHaveLength(1);
    const total = rows.reduce((sum, r) => sum.plus(r.ownershipPercentage), new Prisma.Decimal(0));
    expect(total.lessThanOrEqualTo(100)).toBe(true);
  });

  it("allows a second allocation once the first is safely below 100% (positive control, no false-positive rejection)", async () => {
    const { createOwnership } = await import("@/lib/actions/ownership");

    const ownerA = await createTestOwner(org.organization.id, "Owner A");
    const ownerB = await createTestOwner(org.organization.id, "Owner B");

    await createOwnership(ownershipFormData(ownerA.id, org.reservableUnit.id, 40));
    await createOwnership(ownershipFormData(ownerB.id, org.reservableUnit.id, 40));

    const rows = await prisma.propertyOwnership.findMany({ where: { organizationId: org.organization.id, unitId: org.reservableUnit.id, status: "ACTIVE" } });
    expect(rows).toHaveLength(2);
  });

  it("deterministically forces the read-then-insert overlap (via a synchronization barrier, not a sleep) and proves Serializable isolation still rejects one side", async () => {
    // Promise.allSettled() alone does not reliably force two transactions to
    // overlap on fast localhost Postgres - both requests can complete
    // sequentially fast enough that the second one's own read already sees
    // the first one's committed row, which the application-level <=100%
    // check would correctly reject anyway (no isolation bug needed to
    // explain that outcome). To prove the *isolation guarantee* itself,
    // this test uses a real synchronization barrier (not a timing-based
    // sleep) to force both transactions' reads to happen before either is
    // allowed to write - the exact TOCTOU window createOwnership() must be
    // safe against - and exercises the same
    // activeOwnershipTotalForAsset()/insert sequence createOwnership() uses,
    // under the same Serializable isolation level.
    const ownerA = await createTestOwner(org.organization.id, "Owner A");
    const ownerB = await createTestOwner(org.organization.id, "Owner B");

    let readyCount = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    async function arriveAtBarrier() {
      readyCount++;
      if (readyCount === 2) releaseBarrier();
      await barrier;
    }

    async function attempt(ownerId: string, percentage: number) {
      return prisma.$transaction(
        async (tx) => {
          const existingTotal = await activeOwnershipTotalForAsset(tx, org.organization.id, "UNIT", org.reservableUnit.id);
          // Both transactions block here until BOTH have completed their
          // read - guaranteeing genuine overlap, deterministically.
          await arriveAtBarrier();
          const newTotal = existingTotal.plus(percentage);
          if (newTotal.greaterThan(100)) throw new Error("exceeds 100%");
          await tx.propertyOwnership.create({
            data: { organizationId: org.organization.id, ownerId, unitId: org.reservableUnit.id, ownershipPercentage: percentage, effectiveFrom: new Date("2027-01-01") },
          });
        },
        { isolationLevel: "Serializable" }
      );
    }

    const results = await Promise.allSettled([attempt(ownerA.id, 60), attempt(ownerB.id, 60)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeLessThanOrEqual(1);

    const rows = await prisma.propertyOwnership.findMany({ where: { organizationId: org.organization.id, unitId: org.reservableUnit.id, status: "ACTIVE" } });
    const total = rows.reduce((sum, r) => sum.plus(r.ownershipPercentage), new Prisma.Decimal(0));
    expect(total.lessThanOrEqualTo(100)).toBe(true);
  });
});
