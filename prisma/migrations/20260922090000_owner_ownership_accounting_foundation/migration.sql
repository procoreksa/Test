/*
  Purely additive migration: introduces the internal ownership & owner
  accounting foundation (Owner, PropertyOwnership, OwnerLedgerEntry).

  No existing table is altered, no existing column is touched, and no
  existing row is modified. Every new table starts empty - existing
  Compounds/Buildings/Units simply have no ownership configured until
  someone assigns one via the new /owners and ownership-management UI.
  See docs/OWNERSHIP-ACCOUNTING.md.
*/

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'FUND', 'GOVERNMENT_ENTITY', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OwnershipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "OwnerLedgerEntryType" AS ENUM ('RENT_INCOME', 'OTHER_INCOME', 'MANAGEMENT_FEE', 'MAINTENANCE_EXPENSE', 'UTILITY_EXPENSE', 'SERVICE_EXPENSE', 'GOVERNMENT_FEE', 'OTHER_EXPENSE', 'OWNER_CONTRIBUTION', 'OWNER_DISTRIBUTION', 'ADJUSTMENT', 'REVERSAL');

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nationalId" TEXT,
    "iqamaNumber" TEXT,
    "passportNumber" TEXT,
    "companyRegistrationNumber" TEXT,
    "vatNumber" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "alternateMobile" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'SA',
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "iban" TEXT,
    "notes" TEXT,
    "status" "OwnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_ownerships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "compoundId" TEXT,
    "buildingId" TEXT,
    "unitId" TEXT,
    "ownershipPercentage" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "OwnershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "property_ownerships_pkey" PRIMARY KEY ("id"),
    -- Defense in depth: every ownership record must point at least one
    -- asset level. The percentage-cap-per-asset rule (sum of ACTIVE
    -- ownershipPercentage for the same asset <= 100) is a cross-row rule
    -- and is enforced in the application layer (src/lib/actions/ownership.ts),
    -- not here - Postgres CHECK constraints can't see other rows.
    CONSTRAINT "property_ownerships_at_least_one_asset" CHECK (num_nonnulls("compoundId", "buildingId", "unitId") >= 1)
);

-- CreateTable
CREATE TABLE "owner_ledger_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entryType" "OwnerLedgerEntryType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compoundId" TEXT,
    "unitId" TEXT,
    "reversalOfEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owners_organizationId_idx" ON "owners"("organizationId");

-- CreateIndex
CREATE INDEX "owners_organizationId_deletedAt_idx" ON "owners"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "property_ownerships_organizationId_idx" ON "property_ownerships"("organizationId");

-- CreateIndex
CREATE INDEX "property_ownerships_ownerId_idx" ON "property_ownerships"("ownerId");

-- CreateIndex
CREATE INDEX "property_ownerships_compoundId_idx" ON "property_ownerships"("compoundId");

-- CreateIndex
CREATE INDEX "property_ownerships_buildingId_idx" ON "property_ownerships"("buildingId");

-- CreateIndex
CREATE INDEX "property_ownerships_unitId_idx" ON "property_ownerships"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "owner_ledger_entries_reversalOfEntryId_key" ON "owner_ledger_entries"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_organizationId_idx" ON "owner_ledger_entries"("organizationId");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_ownerId_idx" ON "owner_ledger_entries"("ownerId");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_entryDate_idx" ON "owner_ledger_entries"("entryDate");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "owner_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
