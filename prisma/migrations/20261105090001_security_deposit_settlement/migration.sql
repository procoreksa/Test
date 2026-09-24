-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementResponsibility" AS ENUM ('TENANT', 'OWNER', 'PROPERTY_MANAGEMENT', 'VENDOR', 'WARRANTY', 'UNDETERMINED', 'NO_CHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementDeductionCategory" AS ENUM ('DAMAGE', 'MISSING_INVENTORY', 'MISSING_KEY_OR_ACCESS_DEVICE', 'CLEANING', 'MAINTENANCE', 'OTHER_CONTRACTUAL_CHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssessmentSourceType" AS ENUM ('INSPECTION_ITEM', 'INVENTORY_ITEM', 'KEY_ITEM', 'MAINTENANCE_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementDisputeStatus" AS ENUM ('NONE', 'RAISED', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SecurityDepositLedgerEntryType" AS ENUM ('COLLECTION', 'APPLICATION', 'REFUND', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SecurityDepositRefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "settlementId" TEXT;

-- CreateTable
CREATE TABLE "security_deposit_settlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAvailableDeposit" DECIMAL(12,2),
    "approvedTenantDeductions" DECIMAL(12,2),
    "approvedDepositApplied" DECIMAL(12,2),
    "approvedRefundDue" DECIMAL(12,2),
    "approvedAdditionalDue" DECIMAL(12,2),
    "preparedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "postedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_deposit_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_liability_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "sourceType" "AssessmentSourceType" NOT NULL,
    "moveOutInspectionItemId" TEXT,
    "moveOutInventoryItemId" TEXT,
    "moveOutKeyItemId" TEXT,
    "maintenanceRequestId" TEXT,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "category" "SettlementDeductionCategory" NOT NULL,
    "responsibility" "SettlementResponsibility" NOT NULL DEFAULT 'UNDETERMINED',
    "assessmentReason" TEXT,
    "proposedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(12,2),
    "waivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "waiverReason" TEXT,
    "disputeStatus" "SettlementDisputeStatus" NOT NULL DEFAULT 'NONE',
    "disputeNote" TEXT,
    "assessedByUserId" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_liability_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposit_ledger_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "settlementId" TEXT,
    "refundId" TEXT,
    "entryType" "SecurityDepositLedgerEntryType" NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_deposit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposit_refunds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "SecurityDepositRefundStatus" NOT NULL DEFAULT 'PAID',
    "method" "PaymentMethod",
    "referenceNumber" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_deposit_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposit_settlement_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_deposit_settlement_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_deposit_settlements_moveOutId_key" ON "security_deposit_settlements"("moveOutId");

-- CreateIndex
CREATE INDEX "security_deposit_settlements_organizationId_status_idx" ON "security_deposit_settlements"("organizationId", "status");

-- CreateIndex
CREATE INDEX "security_deposit_settlements_organizationId_contractId_idx" ON "security_deposit_settlements"("organizationId", "contractId");

-- CreateIndex
CREATE INDEX "security_deposit_settlements_organizationId_unitId_idx" ON "security_deposit_settlements"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "security_deposit_settlements_organizationId_renterId_idx" ON "security_deposit_settlements"("organizationId", "renterId");

-- CreateIndex
CREATE INDEX "security_deposit_settlements_organizationId_createdAt_idx" ON "security_deposit_settlements"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "security_deposit_settlements_organizationId_settlementNumbe_key" ON "security_deposit_settlements"("organizationId", "settlementNumber");

-- CreateIndex
CREATE INDEX "move_out_liability_assessments_organizationId_settlementId_idx" ON "move_out_liability_assessments"("organizationId", "settlementId");

-- CreateIndex
CREATE INDEX "move_out_liability_assessments_organizationId_responsibilit_idx" ON "move_out_liability_assessments"("organizationId", "responsibility");

-- CreateIndex
CREATE INDEX "move_out_liability_assessments_organizationId_disputeStatus_idx" ON "move_out_liability_assessments"("organizationId", "disputeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "security_deposit_ledger_entries_reversalOfEntryId_key" ON "security_deposit_ledger_entries"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "security_deposit_ledger_entries_organizationId_contractId_e_idx" ON "security_deposit_ledger_entries"("organizationId", "contractId", "entryDate");

-- CreateIndex
CREATE INDEX "security_deposit_ledger_entries_organizationId_settlementId_idx" ON "security_deposit_ledger_entries"("organizationId", "settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "security_deposit_ledger_entries_organizationId_referenceTyp_key" ON "security_deposit_ledger_entries"("organizationId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "security_deposit_refunds_organizationId_settlementId_idx" ON "security_deposit_refunds"("organizationId", "settlementId");

-- CreateIndex
CREATE INDEX "security_deposit_settlement_notes_organizationId_settlement_idx" ON "security_deposit_settlement_notes"("organizationId", "settlementId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "security_deposit_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlements" ADD CONSTRAINT "security_deposit_settlements_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "security_deposit_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_moveOutInspectionItemId_fkey" FOREIGN KEY ("moveOutInspectionItemId") REFERENCES "move_out_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_moveOutInventoryItemId_fkey" FOREIGN KEY ("moveOutInventoryItemId") REFERENCES "move_out_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_moveOutKeyItemId_fkey" FOREIGN KEY ("moveOutKeyItemId") REFERENCES "move_out_key_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_liability_assessments" ADD CONSTRAINT "move_out_liability_assessments_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_ledger_entries" ADD CONSTRAINT "security_deposit_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_ledger_entries" ADD CONSTRAINT "security_deposit_ledger_entries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_ledger_entries" ADD CONSTRAINT "security_deposit_ledger_entries_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "security_deposit_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_ledger_entries" ADD CONSTRAINT "security_deposit_ledger_entries_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "security_deposit_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_ledger_entries" ADD CONSTRAINT "security_deposit_ledger_entries_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "security_deposit_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_refunds" ADD CONSTRAINT "security_deposit_refunds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_refunds" ADD CONSTRAINT "security_deposit_refunds_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "security_deposit_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlement_notes" ADD CONSTRAINT "security_deposit_settlement_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposit_settlement_notes" ADD CONSTRAINT "security_deposit_settlement_notes_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "security_deposit_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
