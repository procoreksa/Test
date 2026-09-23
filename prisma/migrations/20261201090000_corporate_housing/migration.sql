-- CreateEnum
CREATE TYPE "CorporateAccountStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CorporateContactType" AS ENUM ('PRIMARY', 'HR', 'ADMINISTRATION', 'FINANCE', 'HOUSING_COORDINATOR', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "CorporateOccupantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT_COMPANY');

-- CreateEnum
CREATE TYPE "CorporateHousingAllocationStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "MaintenanceReportedByType" ADD VALUE 'CORPORATE_OCCUPANT';

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "corporateOccupantId" TEXT;

-- CreateTable
CREATE TABLE "corporate_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "CorporateAccountStatus" NOT NULL DEFAULT 'PROSPECT',
    "industry" TEXT,
    "website" TEXT,
    "accountManagerUserId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "corporateAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contactType" "CorporateContactType" NOT NULL DEFAULT 'OTHER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_occupants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "corporateAccountId" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "fullName" TEXT NOT NULL,
    "fullNameAr" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "status" "CorporateOccupantStatus" NOT NULL DEFAULT 'ACTIVE',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_occupants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_housing_allocations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "corporateAccountId" TEXT NOT NULL,
    "occupantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "allocationNumber" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "plannedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "status" "CorporateHousingAllocationStatus" NOT NULL DEFAULT 'PLANNED',
    "bedroomNumber" TEXT,
    "roomLabel" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_housing_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corporate_accounts_renterId_key" ON "corporate_accounts"("renterId");

-- CreateIndex
CREATE INDEX "corporate_accounts_organizationId_status_idx" ON "corporate_accounts"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_accounts_organizationId_accountNumber_key" ON "corporate_accounts"("organizationId", "accountNumber");

-- CreateIndex
CREATE INDEX "corporate_contacts_organizationId_corporateAccountId_idx" ON "corporate_contacts"("organizationId", "corporateAccountId");

-- CreateIndex
CREATE INDEX "corporate_occupants_organizationId_corporateAccountId_statu_idx" ON "corporate_occupants"("organizationId", "corporateAccountId", "status");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_corporateAccou_idx" ON "corporate_housing_allocations"("organizationId", "corporateAccountId", "status");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_occupantId_sta_idx" ON "corporate_housing_allocations"("organizationId", "occupantId", "status");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_contractId_sta_idx" ON "corporate_housing_allocations"("organizationId", "contractId", "status");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_unitId_status_idx" ON "corporate_housing_allocations"("organizationId", "unitId", "status");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_startDate_idx" ON "corporate_housing_allocations"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "corporate_housing_allocations_organizationId_plannedEndDate_idx" ON "corporate_housing_allocations"("organizationId", "plannedEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_housing_allocations_organizationId_allocationNumb_key" ON "corporate_housing_allocations"("organizationId", "allocationNumber");

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_corporateOccupantId_fkey" FOREIGN KEY ("corporateOccupantId") REFERENCES "corporate_occupants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_accountManagerUserId_fkey" FOREIGN KEY ("accountManagerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_contacts" ADD CONSTRAINT "corporate_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_contacts" ADD CONSTRAINT "corporate_contacts_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "corporate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_occupants" ADD CONSTRAINT "corporate_occupants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_occupants" ADD CONSTRAINT "corporate_occupants_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "corporate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_housing_allocations" ADD CONSTRAINT "corporate_housing_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_housing_allocations" ADD CONSTRAINT "corporate_housing_allocations_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "corporate_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_housing_allocations" ADD CONSTRAINT "corporate_housing_allocations_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "corporate_occupants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_housing_allocations" ADD CONSTRAINT "corporate_housing_allocations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_housing_allocations" ADD CONSTRAINT "corporate_housing_allocations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

