/**
 * Shared fixtures for the real, database-backed test suite (vitest.db.config.mts).
 * See docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Cross-tenant DB testing
 * strategy". Every helper here writes directly via Prisma (bypassing server
 * actions/auth) purely to build fixture state quickly; the tests themselves
 * exercise the real server actions under a mocked session to verify
 * authorization and cross-tenant isolation.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { assertSafeTestDatabaseUrl } from "@/lib/test-db-guard";
import { createContractWithSchedule } from "@/lib/contract-schedule";
import { issueInvoice } from "@/lib/invoicing";
import type { UserRole } from "@prisma/client";

assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

/** Truncates every application table (except Prisma's own migrations table) between tests. */
export async function resetDatabase() {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export function uniqueSuffix() {
  return randomUUID().slice(0, 8);
}

export async function createTestOrganization(name: string) {
  return prisma.organization.create({
    data: { name, vatNumber: "300000000000003" },
  });
}

export async function createTestUser(organizationId: string, role: UserRole, email?: string) {
  return prisma.user.create({
    data: {
      organizationId,
      name: `${role} test user`,
      email: email ?? `${role.toLowerCase()}-${uniqueSuffix()}@example.com`,
      passwordHash: "not-a-real-hash-tests-mock-auth-directly",
      role,
    },
  });
}

/** Session shape matching next-auth's Session, for mocking `@/lib/auth`'s `auth()`. */
export function sessionFor(user: { id: string; email: string; role: UserRole; organizationId: string }, organizationName = "Test Org") {
  return {
    user: {
      id: user.id,
      name: "Test User",
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName,
    },
  };
}

export async function createTestCompound(organizationId: string, name = "Compound") {
  return prisma.compound.create({ data: { organizationId, name } });
}

export async function createTestBuilding(organizationId: string, compoundId: string, name = "Building") {
  return prisma.building.create({ data: { organizationId, compoundId, name } });
}

export async function createTestFloor(organizationId: string, buildingId: string, floorNumber = 1) {
  return prisma.floor.create({ data: { organizationId, buildingId, floorNumber } });
}

export async function createTestUnit(organizationId: string, floorId: string, overrides: Partial<{ unitNumber: string; baseRentAmount: number; vatApplicable: boolean }> = {}) {
  return prisma.unit.create({
    data: {
      organizationId,
      floorId,
      unitNumber: overrides.unitNumber ?? `U-${uniqueSuffix()}`,
      baseRentAmount: overrides.baseRentAmount ?? 1000,
      vatApplicable: overrides.vatApplicable ?? false,
    },
  });
}

export async function createTestRenter(organizationId: string, name = "Test Renter") {
  return prisma.renter.create({ data: { organizationId, fullName: name } });
}

export async function createTestOwner(organizationId: string, name = "Test Owner") {
  return prisma.owner.create({ data: { organizationId, name, iban: "SA1234567890123456789012" } });
}

/**
 * A fully wired organization: compound -> building -> floor -> unit, a
 * renter, an owner (100% assigned to the unit), an admin user, and the
 * matching mocked session - everything a cross-org/IDOR test needs to
 * assert that another organization's admin cannot reach any of it.
 */
export async function seedFullOrg(label: string) {
  const organization = await createTestOrganization(`${label} Org`);
  const admin = await createTestUser(organization.id, "ADMIN");
  const compound = await createTestCompound(organization.id, `${label} Compound`);
  const building = await createTestBuilding(organization.id, compound.id, `${label} Building`);
  const floor = await createTestFloor(organization.id, building.id, 1);
  const unit = await createTestUnit(organization.id, floor.id, { unitNumber: `${label}-101` });
  const renter = await createTestRenter(organization.id, `${label} Renter`);
  const owner = await createTestOwner(organization.id, `${label} Owner`);
  const ownership = await prisma.propertyOwnership.create({
    data: { organizationId: organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 },
  });

  return {
    organization,
    admin,
    session: sessionFor(admin, organization.name),
    compound,
    building,
    floor,
    unit,
    renter,
    owner,
    ownership,
  };
}

export type SeededOrg = Awaited<ReturnType<typeof seedFullOrg>>;

/**
 * Adds a real contract (with generated schedule), an issued invoice, a
 * posted payment, and an owner ledger entry to an already-seeded org - used
 * by tests that need financial records to attempt cross-org access against.
 * Uses the real contract-schedule/invoicing library functions (not the
 * server actions) so amounts/VAT/schedule generation are the genuine
 * calculation logic, without exercising the auth layer being tested.
 */
export async function seedFinancialsForOrg(org: SeededOrg) {
  const contract = await createContractWithSchedule(prisma, org.organization.id, {
    unitId: org.unit.id,
    renterId: org.renter.id,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2027-01-01"),
    rentAmount: 12000,
    paymentFrequency: "ANNUAL",
    extraChargesMode: "ONE_TIME",
    vatApplicable: false,
  });

  const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });

  const invoice = await issueInvoice({
    organizationId: org.organization.id,
    renterId: org.renter.id,
    contractId: contract.id,
    paymentScheduleId: schedule.id,
    lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 12000, vatRate: 0 }],
  });

  const payment = await prisma.payment.create({
    data: {
      organizationId: org.organization.id,
      invoiceId: invoice.id,
      renterId: org.renter.id,
      receiptNumber: `RCT-TEST-${uniqueSuffix()}`,
      amount: 12000,
      method: "BANK_TRANSFER",
    },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 12000, status: "PAID" } });

  const ledgerEntry = await prisma.ownerLedgerEntry.create({
    data: {
      organizationId: org.organization.id,
      ownerId: org.owner.id,
      entryType: "RENT_INCOME",
      referenceType: "MANUAL",
      description: "Rent income",
      credit: 12000,
      unitId: org.unit.id,
    },
  });

  return { contract, schedule, invoice, payment, ledgerEntry };
}

export type SeededFinancials = Awaited<ReturnType<typeof seedFinancialsForOrg>>;
