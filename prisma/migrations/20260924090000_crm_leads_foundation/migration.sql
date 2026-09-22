/*
  Purely additive migration: adds the CRM Leads foundation.
  - New tables: leads, lead_activities.
  - New enums: LeadType, LeadStatus, LeadSource, FurnishingPreference,
    LeadLostReason, LeadActivityType.
  - Nullable foreign keys from leads to compounds/users/renters/contracts
    (all ON DELETE SET NULL) and organizationId-scoped FKs to
    organizations for both new tables (ON DELETE CASCADE, matching every
    other tenant-scoped table in this schema).

  No existing table, column, index, or row is altered, dropped, or
  renamed. See docs/CRM-LEADS.md.
*/

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'AGENT_REFERRAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_PENDING', 'VIEWING_COMPLETED', 'OFFER_PENDING', 'NEGOTIATION', 'RESERVATION_PENDING', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'WALK_IN', 'CORPORATE', 'AGENT', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "FurnishingPreference" AS ENUM ('FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "LeadLostReason" AS ENUM ('PRICE', 'NO_AVAILABILITY', 'LOCATION', 'COMPETITOR', 'NO_RESPONSE', 'BUDGET', 'TIMING', 'CUSTOMER_CANCELLED', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOW_UP', 'STATUS_CHANGE', 'OTHER');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadNumber" TEXT NOT NULL,
    "leadType" "LeadType" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "normalizedMobile" TEXT NOT NULL,
    "alternateMobile" TEXT,
    "email" TEXT,
    "nationality" TEXT,
    "employer" TEXT,
    "jobTitle" TEXT,
    "companyName" TEXT,
    "contactPersonName" TEXT,
    "contactPersonMobile" TEXT,
    "contactPersonEmail" TEXT,
    "employeeCount" INTEGER,
    "requiredUnits" INTEGER,
    "requestedCity" TEXT,
    "projectName" TEXT,
    "housingStartDate" TIMESTAMP(3),
    "housingEndDate" TIMESTAMP(3),
    "familySize" INTEGER,
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "preferredBedrooms" INTEGER,
    "preferredUnitType" "UnitType",
    "preferredCompoundId" TEXT,
    "moveInDate" TIMESTAMP(3),
    "leaseDurationMonths" INTEGER,
    "furnishedPreference" "FurnishingPreference",
    "notes" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "convertedRenterId" TEXT,
    "convertedContractId" TEXT,
    "lostReason" "LeadLostReason",
    "lostReasonNote" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "activityType" "LeadActivityType" NOT NULL,
    "subject" TEXT,
    "notes" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedRenterId_key" ON "leads"("convertedRenterId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedContractId_key" ON "leads"("convertedContractId");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_idx" ON "leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leads_organizationId_normalizedMobile_idx" ON "leads"("organizationId", "normalizedMobile");

-- CreateIndex
CREATE INDEX "leads_organizationId_assignedToUserId_idx" ON "leads"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "leads_organizationId_nextFollowUpAt_idx" ON "leads"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_source_idx" ON "leads"("organizationId", "source");

-- CreateIndex
CREATE INDEX "leads_organizationId_createdAt_idx" ON "leads"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organizationId_leadNumber_key" ON "leads"("organizationId", "leadNumber");

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_leadId_idx" ON "lead_activities"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_activityDate_idx" ON "lead_activities"("organizationId", "activityDate");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_preferredCompoundId_fkey" FOREIGN KEY ("preferredCompoundId") REFERENCES "compounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedRenterId_fkey" FOREIGN KEY ("convertedRenterId") REFERENCES "renters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedContractId_fkey" FOREIGN KEY ("convertedContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

