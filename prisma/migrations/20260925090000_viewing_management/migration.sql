/*
  Purely additive migration: adds the CRM Viewing Management foundation.
  - New tables: viewings, viewing_units.
  - New enums: ViewingStatus, ViewingOutcome, ViewingCancelReason.
  - FKs to organizations (ON DELETE CASCADE, matching every other
    tenant-scoped table), leads (ON DELETE CASCADE - a viewing has no
    meaning without its lead), users (ON DELETE SET NULL, matching
    Lead.assignedToUserId), and units (ON DELETE RESTRICT - a unit with
    viewing history should never be silently deletable out from under it).

  No existing table, column, index, or row is altered, dropped, or
  renamed. See docs/VIEWING-MANAGEMENT.md.
*/

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "ViewingOutcome" AS ENUM ('INTERESTED', 'FOLLOW_UP_REQUIRED', 'NOT_INTERESTED', 'OFFER_REQUESTED', 'RESERVATION_REQUESTED', 'OTHER');

-- CreateEnum
CREATE TYPE "ViewingCancelReason" AS ENUM ('CUSTOMER_REQUEST', 'AGENT_UNAVAILABLE', 'UNIT_UNAVAILABLE', 'RESCHEDULED', 'NO_RESPONSE', 'OTHER');

-- CreateTable
CREATE TABLE "viewings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "viewingNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "feedbackSummary" TEXT,
    "outcome" "ViewingOutcome",
    "cancelReason" "ViewingCancelReason",
    "cancelReasonNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewing_units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "viewingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewing_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "viewings_organizationId_scheduledStart_idx" ON "viewings"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "viewings_organizationId_assignedToUserId_scheduledStart_idx" ON "viewings"("organizationId", "assignedToUserId", "scheduledStart");

-- CreateIndex
CREATE INDEX "viewings_organizationId_leadId_idx" ON "viewings"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "viewings_organizationId_status_idx" ON "viewings"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "viewings_organizationId_viewingNumber_key" ON "viewings"("organizationId", "viewingNumber");

-- CreateIndex
CREATE INDEX "viewing_units_organizationId_unitId_idx" ON "viewing_units"("organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "viewing_units_viewingId_unitId_key" ON "viewing_units"("viewingId", "unitId");

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_units" ADD CONSTRAINT "viewing_units_viewingId_fkey" FOREIGN KEY ("viewingId") REFERENCES "viewings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_units" ADD CONSTRAINT "viewing_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

