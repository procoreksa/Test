-- Reservation -> Contract Conversion (docs/RESERVATION-TO-CONTRACT.md).
-- Purely additive: two new nullable columns, one new unique index, one new
-- FK - no destructive change, no existing column touched, no data loss.
--
-- contracts.reservationId: nullable + unique. Most existing/future
-- contracts stay NULL (manually created or renewed) - only a Contract
-- created via convertReservationToContract() ever gets a value. This is
-- the single physical relation between Contract and Reservation;
-- Reservation's own "which Contract did I become" side
-- (Reservation.convertedContract) is a Prisma virtual back-relation over
-- this same column, not a second physical FK (see schema.prisma comments
-- on both models for the "one relation, both directions" rationale).
-- onDelete: SET NULL, matching every other optional cross-module FK in
-- this schema (e.g. Lead.convertedContractId, Reservation.assignedToUserId)
-- - deleting a Contract (no delete action exists for Contract today, but
-- the FK policy should still be principled) never cascades into deleting
-- the Reservation that produced it.
--
-- reservations.convertedAt: nullable timestamp, set only alongside
-- status -> CONVERTED_TO_CONTRACT, mirroring the existing
-- confirmedAt/cancelledAt/expiredAt/releasedAt lifecycle-timestamp
-- pattern already on this table.

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "reservationId" TEXT;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "convertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_reservationId_key" ON "contracts"("reservationId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
