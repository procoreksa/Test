/*
  Purely additive migration:
    - New `audit_logs` table (immutable audit trail - see docs/AUDIT-AND-FINANCIAL-CONTROLS.md).
    - `contracts.renewedFromContractId` (nullable, self-referencing) - links a
      renewed contract back to its predecessor. Every pre-existing contract
      is simply left unlinked (NULL).
    - `payments.status` (NOT NULL with a DEFAULT, so every existing payment
      row is automatically backfilled to 'POSTED') and
      `payments.reversalOfPaymentId` (nullable, self-referencing) - the
      foundation for payment reversal. No existing payment row is altered
      beyond gaining this default status.

  No existing column is dropped, renamed, or narrowed, and no existing row's
  data is modified beyond the automatic DEFAULT backfill on the new
  `payments.status` column.
*/

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "renewedFromContractId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reversalOfPaymentId" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED';

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityDisplayName" TEXT,
    "previousValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_renewedFromContractId_key" ON "contracts"("renewedFromContractId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reversalOfPaymentId_key" ON "payments"("reversalOfPaymentId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_renewedFromContractId_fkey" FOREIGN KEY ("renewedFromContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversalOfPaymentId_fkey" FOREIGN KEY ("reversalOfPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
