-- CreateEnum
CREATE TYPE "MoveOutStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_FINDINGS_REVIEW', 'READY_FOR_CLOSURE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MoveOutCancelReason" AS ENUM ('CONTRACT_REINSTATED', 'TENANT_REQUEST', 'RESCHEDULED', 'DATA_ERROR', 'OTHER');

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "moveOutId" TEXT,
ADD COLUMN     "moveOutInspectionItemId" TEXT;

-- CreateTable
CREATE TABLE "move_outs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "moveInId" TEXT,
    "status" "MoveOutStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "vacateDate" TIMESTAMP(3),
    "inspectedByUserId" TEXT,
    "handedOverByUserId" TEXT,
    "findingsReviewedAt" TIMESTAMP(3),
    "findingsReviewedByUserId" TEXT,
    "tenantRepresentativeName" TEXT,
    "tenantRepresentativeId" TEXT,
    "overallCondition" "ConditionRating",
    "tenantComments" TEXT,
    "internalNotes" TEXT,
    "tenantAcknowledgedAt" TIMESTAMP(3),
    "tenantAcknowledgementOverride" BOOLEAN NOT NULL DEFAULT false,
    "tenantAcknowledgementOverrideReason" TEXT,
    "staffAcknowledgedAt" TIMESTAMP(3),
    "noKeysToReturn" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" "MoveOutCancelReason",
    "cancelReasonNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_inspection_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "category" "InspectionCategory" NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemNameAr" TEXT,
    "condition" "ConditionRating",
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "requiresAttention" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL,
    "moveInInspectionItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_inventory_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "category" "InspectionCategory" NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "ConditionRating",
    "serialNumber" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_meter_readings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "meterType" "MeterType" NOT NULL,
    "meterNumber" TEXT,
    "reading" DECIMAL(12,2) NOT NULL,
    "unitOfMeasure" TEXT,
    "readingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "move_out_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_key_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "keyType" "KeyType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "identifier" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_key_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_out_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "inspectionItemId" TEXT,
    "inventoryItemId" TEXT,
    "attachmentType" "MoveInAttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "storageKey" TEXT,
    "caption" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "move_out_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "move_outs_organizationId_status_idx" ON "move_outs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "move_outs_organizationId_contractId_idx" ON "move_outs"("organizationId", "contractId");

-- CreateIndex
CREATE INDEX "move_outs_organizationId_unitId_idx" ON "move_outs"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "move_outs_organizationId_renterId_idx" ON "move_outs"("organizationId", "renterId");

-- CreateIndex
CREATE INDEX "move_outs_organizationId_scheduledAt_idx" ON "move_outs"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "move_outs_organizationId_vacateDate_idx" ON "move_outs"("organizationId", "vacateDate");

-- CreateIndex
CREATE UNIQUE INDEX "move_outs_organizationId_moveOutNumber_key" ON "move_outs"("organizationId", "moveOutNumber");

-- CreateIndex
CREATE INDEX "move_out_inspection_items_organizationId_moveOutId_idx" ON "move_out_inspection_items"("organizationId", "moveOutId");

-- CreateIndex
CREATE INDEX "move_out_inspection_items_moveOutId_category_idx" ON "move_out_inspection_items"("moveOutId", "category");

-- CreateIndex
CREATE INDEX "move_out_inventory_items_organizationId_moveOutId_idx" ON "move_out_inventory_items"("organizationId", "moveOutId");

-- CreateIndex
CREATE INDEX "move_out_meter_readings_organizationId_moveOutId_idx" ON "move_out_meter_readings"("organizationId", "moveOutId");

-- CreateIndex
CREATE INDEX "move_out_key_items_organizationId_moveOutId_idx" ON "move_out_key_items"("organizationId", "moveOutId");

-- CreateIndex
CREATE INDEX "move_out_attachments_organizationId_moveOutId_idx" ON "move_out_attachments"("organizationId", "moveOutId");

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_inspectedByUserId_fkey" FOREIGN KEY ("inspectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_handedOverByUserId_fkey" FOREIGN KEY ("handedOverByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_findingsReviewedByUserId_fkey" FOREIGN KEY ("findingsReviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_inspection_items" ADD CONSTRAINT "move_out_inspection_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_inspection_items" ADD CONSTRAINT "move_out_inspection_items_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_inspection_items" ADD CONSTRAINT "move_out_inspection_items_moveInInspectionItemId_fkey" FOREIGN KEY ("moveInInspectionItemId") REFERENCES "move_in_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_inventory_items" ADD CONSTRAINT "move_out_inventory_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_inventory_items" ADD CONSTRAINT "move_out_inventory_items_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_meter_readings" ADD CONSTRAINT "move_out_meter_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_meter_readings" ADD CONSTRAINT "move_out_meter_readings_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_key_items" ADD CONSTRAINT "move_out_key_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_key_items" ADD CONSTRAINT "move_out_key_items_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_attachments" ADD CONSTRAINT "move_out_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_attachments" ADD CONSTRAINT "move_out_attachments_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_attachments" ADD CONSTRAINT "move_out_attachments_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "move_out_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_attachments" ADD CONSTRAINT "move_out_attachments_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "move_out_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_moveOutInspectionItemId_fkey" FOREIGN KEY ("moveOutInspectionItemId") REFERENCES "move_out_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

