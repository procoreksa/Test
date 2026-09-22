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
import type { UserRole, ViewingStatus, OfferStatus, ReservationStatus, ReservationAmountStatus } from "@prisma/client";

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

export async function createTestLead(organizationId: string, createdByUserId: string, overrides: Partial<{ fullName: string; mobile: string }> = {}) {
  const mobile = overrides.mobile ?? "0501234567";
  return prisma.lead.create({
    data: {
      organizationId,
      leadNumber: `LEAD-${uniqueSuffix()}`,
      fullName: overrides.fullName ?? "Test Lead",
      mobile,
      normalizedMobile: `966${mobile.replace(/^0/, "")}`,
      source: "WEBSITE",
      createdByUserId,
    },
  });
}

export async function createTestViewing(
  organizationId: string,
  leadId: string,
  unitIds: string[],
  createdByUserId: string,
  overrides: Partial<{ assignedToUserId: string; scheduledStart: Date; scheduledEnd: Date; status: ViewingStatus }> = {}
) {
  const viewing = await prisma.viewing.create({
    data: {
      organizationId,
      viewingNumber: `VIEW-${uniqueSuffix()}`,
      leadId,
      assignedToUserId: overrides.assignedToUserId,
      scheduledStart: overrides.scheduledStart ?? new Date("2026-07-01T10:00:00Z"),
      scheduledEnd: overrides.scheduledEnd ?? new Date("2026-07-01T11:00:00Z"),
      status: overrides.status ?? "SCHEDULED",
      createdByUserId,
    },
  });
  await prisma.viewingUnit.createMany({
    data: unitIds.map((unitId, i) => ({ organizationId, viewingId: viewing.id, unitId, sequence: i + 1 })),
  });
  return viewing;
}

export async function createTestOffer(
  organizationId: string,
  leadId: string,
  unitId: string,
  createdByUserId: string,
  overrides: Partial<{
    viewingId: string;
    assignedToUserId: string;
    status: OfferStatus;
    offerNumber: string;
    versionNumber: number;
    parentOfferId: string;
    annualRent: number;
    discountPercentage: number;
    validFrom: Date;
    validUntil: Date;
    leaseStartDate: Date | null;
    leaseDurationMonths: number;
    leasingCommissionAmount: number;
    specialTerms: string;
    paymentFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "ONE_TIME";
  }> = {}
) {
  const annualRent = overrides.annualRent ?? 80000;
  const discountPercentage = overrides.discountPercentage ?? 0;
  const discountAmount = (annualRent * discountPercentage) / 100;
  const netAnnualRent = annualRent - discountAmount;
  return prisma.leasingOffer.create({
    data: {
      organizationId,
      offerNumber: overrides.offerNumber ?? `OFFER-${uniqueSuffix()}`,
      versionNumber: overrides.versionNumber ?? 1,
      parentOfferId: overrides.parentOfferId,
      leadId,
      viewingId: overrides.viewingId,
      unitId,
      assignedToUserId: overrides.assignedToUserId,
      status: overrides.status ?? "DRAFT",
      validFrom: overrides.validFrom ?? new Date("2027-01-01T00:00:00Z"),
      validUntil: overrides.validUntil ?? new Date("2027-12-31T00:00:00Z"),
      annualRent,
      discountAmount,
      discountPercentage,
      netAnnualRent,
      securityDeposit: netAnnualRent / 4,
      totalInitialPayment: netAnnualRent / 4,
      paymentFrequency: overrides.paymentFrequency ?? "QUARTERLY",
      leaseStartDate: overrides.leaseStartDate,
      leaseDurationMonths: overrides.leaseDurationMonths ?? 12,
      leasingCommissionAmount: overrides.leasingCommissionAmount ?? 0,
      specialTerms: overrides.specialTerms,
      createdByUserId,
    },
  });
}

export async function createTestReservation(
  organizationId: string,
  leadId: string,
  offerId: string,
  unitId: string,
  createdByUserId: string,
  overrides: Partial<{
    status: ReservationStatus;
    assignedToUserId: string;
    holdUntil: Date;
    reservationAmount: number;
    reservationAmountStatus: ReservationAmountStatus;
  }> = {}
) {
  const reservationAmount = overrides.reservationAmount ?? 0;
  return prisma.reservation.create({
    data: {
      organizationId,
      reservationNumber: `RES-${uniqueSuffix()}`,
      leadId,
      offerId,
      unitId,
      assignedToUserId: overrides.assignedToUserId,
      status: overrides.status ?? "DRAFT",
      holdUntil: overrides.holdUntil ?? new Date("2027-12-31T00:00:00Z"),
      reservationAmount,
      reservationAmountStatus: overrides.reservationAmountStatus ?? (reservationAmount > 0 ? "PENDING" : "NOT_REQUIRED"),
      createdByUserId,
    },
  });
}

/**
 * A fully wired organization: compound -> building -> floor -> two units, a
 * renter, an owner (100% assigned to the first unit), an admin user, a
 * lead, a scheduled viewing, a Draft leasing offer on the first unit, an
 * ACCEPTED offer on the second unit, a Draft reservation from that accepted
 * offer, and the matching mocked session - everything a cross-org/IDOR test
 * needs to assert that another organization's admin cannot reach any of it.
 */
export async function seedFullOrg(label: string) {
  const organization = await createTestOrganization(`${label} Org`);
  const admin = await createTestUser(organization.id, "ADMIN");
  const compound = await createTestCompound(organization.id, `${label} Compound`);
  const building = await createTestBuilding(organization.id, compound.id, `${label} Building`);
  const floor = await createTestFloor(organization.id, building.id, 1);
  const unit = await createTestUnit(organization.id, floor.id, { unitNumber: `${label}-101` });
  const reservableUnit = await createTestUnit(organization.id, floor.id, { unitNumber: `${label}-102` });
  const renter = await createTestRenter(organization.id, `${label} Renter`);
  const owner = await createTestOwner(organization.id, `${label} Owner`);
  const ownership = await prisma.propertyOwnership.create({
    data: { organizationId: organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 },
  });
  const lead = await createTestLead(organization.id, admin.id, { fullName: `${label} Lead`, mobile: "0501234567" });
  const viewing = await createTestViewing(organization.id, lead.id, [unit.id], admin.id, { assignedToUserId: admin.id });
  const offer = await createTestOffer(organization.id, lead.id, unit.id, admin.id, { assignedToUserId: admin.id });
  const acceptedOffer = await createTestOffer(organization.id, lead.id, reservableUnit.id, admin.id, { assignedToUserId: admin.id, status: "ACCEPTED" });
  const reservation = await createTestReservation(organization.id, lead.id, acceptedOffer.id, reservableUnit.id, admin.id, { assignedToUserId: admin.id });

  return {
    organization,
    admin,
    session: sessionFor(admin, organization.name),
    compound,
    building,
    floor,
    unit,
    reservableUnit,
    renter,
    owner,
    ownership,
    lead,
    viewing,
    offer,
    acceptedOffer,
    reservation,
  };
}

export type SeededOrg = Awaited<ReturnType<typeof seedFullOrg>>;

/**
 * A fresh Unit + ACCEPTED Offer (with leaseStartDate set, since Offer's
 * own field is nullable and createReservation()/convertReservationToContract()
 * both need it) + CONFIRMED Reservation, with the Unit's status manually
 * set to RESERVED - fixtures bypass the real confirmReservation() server
 * action (which is what sets that invariant in production), so it must be
 * set explicitly here to match what convertReservationToContract() expects
 * to find. Always a brand-new Unit/Offer (never org.unit/org.acceptedOffer)
 * so Reservation -> Contract conversion tests never collide with the base
 * seedFullOrg() fixtures other tests already depend on.
 */
export async function createConvertibleReservation(
  org: SeededOrg,
  overrides: Partial<{
    unitNumber: string;
    annualRent: number;
    leaseStartDate: Date;
    leaseDurationMonths: number;
    paymentFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "ONE_TIME";
    leasingCommissionAmount: number;
    specialTerms: string;
    reservationAmount: number;
  }> = {}
) {
  const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: overrides.unitNumber ?? `CONV-${uniqueSuffix()}` });
  const offer = await createTestOffer(org.organization.id, org.lead.id, unit.id, org.admin.id, {
    assignedToUserId: org.admin.id,
    status: "ACCEPTED",
    annualRent: overrides.annualRent ?? 80000,
    leaseStartDate: overrides.leaseStartDate ?? new Date("2027-06-01T00:00:00Z"),
    leaseDurationMonths: overrides.leaseDurationMonths ?? 12,
    paymentFrequency: overrides.paymentFrequency ?? "QUARTERLY",
    leasingCommissionAmount: overrides.leasingCommissionAmount ?? 4000,
    specialTerms: overrides.specialTerms,
  });
  const reservation = await createTestReservation(org.organization.id, org.lead.id, offer.id, unit.id, org.admin.id, {
    assignedToUserId: org.admin.id,
    status: "CONFIRMED",
    reservationAmount: overrides.reservationAmount ?? 0,
  });
  await prisma.unit.update({ where: { id: unit.id }, data: { status: "RESERVED" } });
  return { unit, offer, reservation };
}

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

/**
 * A fresh Unit + ACTIVE Contract (with generated schedule) for Move-In
 * tests (docs/MOVE-IN-HANDOVER.md) - uses the real createContractWithSchedule()
 * service directly (bypassing the server action, same as seedFinancialsForOrg())
 * so Contract.status/Unit.status land exactly as production contract
 * creation leaves them (ACTIVE/OCCUPIED). Always a brand-new Unit (never
 * org.unit) so Move-In tests never collide with other fixtures that already
 * depend on org.unit's own state.
 */
export async function createTestContract(
  org: SeededOrg,
  overrides: Partial<{ unitNumber: string; renterId: string; rentAmount: number; startDate: Date; endDate: Date }> = {}
) {
  const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: overrides.unitNumber ?? `CTR-${uniqueSuffix()}` });
  const contract = await createContractWithSchedule(prisma, org.organization.id, {
    unitId: unit.id,
    renterId: overrides.renterId ?? org.renter.id,
    startDate: overrides.startDate ?? new Date("2027-01-01"),
    endDate: overrides.endDate ?? new Date("2028-01-01"),
    rentAmount: overrides.rentAmount ?? 12000,
    paymentFrequency: "ANNUAL",
    extraChargesMode: "ONE_TIME",
    vatApplicable: false,
  });
  return { unit, contract };
}
