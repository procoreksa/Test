-- Reservation Management (additive only)
--
-- Adds three new enums (ReservationStatus, ReservationAmountStatus,
-- ReservationCancelReason), one new enum VALUE on the existing UnitStatus
-- type (RESERVED), and one new table (reservations). No existing table,
-- column, index, or constraint is altered or dropped - verified
-- additive-only via `prisma migrate diff --from-url <dev-db>
-- --to-schema-datamodel schema.prisma`.
--
-- ALTER TYPE ... ADD VALUE is safe inside this migration's own transaction
-- on Postgres 12+ (this project runs Postgres 16) because the new value is
-- never read/written in the same migration - only later application code
-- uses it.
--
-- FK onDelete behavior:
--   organizationId -> organizations: CASCADE (org deletion removes its reservations)
--   leadId         -> leads:         CASCADE (matches Viewing/LeasingOffer.leadId)
--   offerId        -> leasing_offers: RESTRICT (an Offer with reservation history
--                                    cannot be deleted out from under it - offers
--                                    are never deleted by any action anyway)
--   unitId         -> units:         RESTRICT (matches Contract.unitId/
--                                    LeasingOffer.unitId)
--   assignedToUserId -> users:       SET NULL (matches Lead/Viewing/Offer's own
--                                    assignedToUserId - an agent leaving the
--                                    org never orphans reservation history)

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'RELEASED', 'CONVERTED_TO_CONTRACT');

-- CreateEnum
CREATE TYPE "ReservationAmountStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RECEIVED', 'REFUNDED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "ReservationCancelReason" AS ENUM ('CUSTOMER_REQUEST', 'PAYMENT_NOT_RECEIVED', 'DOCUMENTS_INCOMPLETE', 'UNIT_CHANGED', 'OFFER_CHANGED', 'TIMEOUT', 'MANAGEMENT_DECISION', 'OTHER');

-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'RESERVED';

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'DRAFT',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdUntil" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "reservationAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reservationAmountStatus" "ReservationAmountStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "notes" TEXT,
    "internalNotes" TEXT,
    "cancelReason" "ReservationCancelReason",
    "cancelReasonNote" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_organizationId_status_idx" ON "reservations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "reservations_organizationId_unitId_status_idx" ON "reservations"("organizationId", "unitId", "status");

-- CreateIndex
CREATE INDEX "reservations_organizationId_offerId_idx" ON "reservations"("organizationId", "offerId");

-- CreateIndex
CREATE INDEX "reservations_organizationId_leadId_idx" ON "reservations"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "reservations_organizationId_assignedToUserId_idx" ON "reservations"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "reservations_organizationId_holdUntil_idx" ON "reservations"("organizationId", "holdUntil");

-- CreateIndex
CREATE INDEX "reservations_organizationId_createdAt_idx" ON "reservations"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_organizationId_reservationNumber_key" ON "reservations"("organizationId", "reservationNumber");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "leasing_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
