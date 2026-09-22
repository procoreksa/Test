-- Move-In & Handover Inspection (docs/MOVE-IN-HANDOVER.md).
-- Purely additive: 6 new enums, 6 new tables, and new FKs pointing INTO
-- existing tables (contracts/units/renters/users/organizations) - no
-- existing column, table, or constraint is altered or dropped.

-- CreateEnum
CREATE TYPE "MoveInStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'READY_FOR_HANDOVER', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MoveInCancelReason" AS ENUM ('CONTRACT_CANCELLED', 'CUSTOMER_REQUEST', 'UNIT_NOT_READY', 'RESCHEDULED', 'DATA_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "ConditionRating" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NOT_WORKING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "InspectionCategory" AS ENUM ('ENTRANCE', 'LIVING_ROOM', 'DINING_ROOM', 'KITCHEN', 'BEDROOM', 'BATHROOM', 'BALCONY', 'WINDOWS_DOORS', 'FLOORING', 'WALLS_CEILINGS', 'LIGHTING', 'ELECTRICAL', 'PLUMBING', 'AIR_CONDITIONING', 'APPLIANCES', 'FURNITURE', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('ELECTRICITY', 'WATER', 'GAS', 'OTHER');

-- CreateEnum
CREATE TYPE "KeyType" AS ENUM ('KEY', 'ACCESS_CARD', 'REMOTE', 'PARKING_REMOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "MoveInAttachmentType" AS ENUM ('PHOTO', 'DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "move_ins" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "status" "MoveInStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "handoverDate" TIMESTAMP(3),
    "inspectedByUserId" TEXT,
    "handedOverByUserId" TEXT,
    "tenantRepresentativeName" TEXT,
    "tenantRepresentativeId" TEXT,
    "overallCondition" "ConditionRating",
    "tenantComments" TEXT,
    "internalNotes" TEXT,
    "tenantAcknowledgedAt" TIMESTAMP(3),
    "tenantAcknowledgementOverride" BOOLEAN NOT NULL DEFAULT false,
    "tenantAcknowledgementOverrideReason" TEXT,
    "staffAcknowledgedAt" TIMESTAMP(3),
    "isFurnished" BOOLEAN NOT NULL DEFAULT false,
    "utilitiesReady" BOOLEAN NOT NULL DEFAULT false,
    "keysReady" BOOLEAN NOT NULL DEFAULT false,
    "cleaningComplete" BOOLEAN NOT NULL DEFAULT false,
    "unitReady" BOOLEAN NOT NULL DEFAULT false,
    "noKeysToRecord" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" "MoveInCancelReason",
    "cancelReasonNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_inspection_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInId" TEXT NOT NULL,
    "category" "InspectionCategory" NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemNameAr" TEXT,
    "condition" "ConditionRating",
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "requiresAttention" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_in_inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_inventory_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInId" TEXT NOT NULL,
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

    CONSTRAINT "move_in_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_meter_readings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInId" TEXT NOT NULL,
    "meterType" "MeterType" NOT NULL,
    "meterNumber" TEXT,
    "reading" DECIMAL(12,2) NOT NULL,
    "unitOfMeasure" TEXT,
    "readingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "move_in_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_key_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInId" TEXT NOT NULL,
    "keyType" "KeyType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "identifier" TEXT,
    "returnedExpected" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_in_key_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moveInId" TEXT NOT NULL,
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

    CONSTRAINT "move_in_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "move_ins_organizationId_status_idx" ON "move_ins"("organizationId", "status");

-- CreateIndex
CREATE INDEX "move_ins_organizationId_contractId_idx" ON "move_ins"("organizationId", "contractId");

-- CreateIndex
CREATE INDEX "move_ins_organizationId_unitId_idx" ON "move_ins"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "move_ins_organizationId_renterId_idx" ON "move_ins"("organizationId", "renterId");

-- CreateIndex
CREATE INDEX "move_ins_organizationId_scheduledAt_idx" ON "move_ins"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "move_ins_organizationId_handoverDate_idx" ON "move_ins"("organizationId", "handoverDate");

-- CreateIndex
CREATE UNIQUE INDEX "move_ins_organizationId_moveInNumber_key" ON "move_ins"("organizationId", "moveInNumber");

-- CreateIndex
CREATE INDEX "move_in_inspection_items_organizationId_moveInId_idx" ON "move_in_inspection_items"("organizationId", "moveInId");

-- CreateIndex
CREATE INDEX "move_in_inspection_items_moveInId_category_idx" ON "move_in_inspection_items"("moveInId", "category");

-- CreateIndex
CREATE INDEX "move_in_inventory_items_organizationId_moveInId_idx" ON "move_in_inventory_items"("organizationId", "moveInId");

-- CreateIndex
CREATE INDEX "move_in_meter_readings_organizationId_moveInId_idx" ON "move_in_meter_readings"("organizationId", "moveInId");

-- CreateIndex
CREATE INDEX "move_in_key_items_organizationId_moveInId_idx" ON "move_in_key_items"("organizationId", "moveInId");

-- CreateIndex
CREATE INDEX "move_in_attachments_organizationId_moveInId_idx" ON "move_in_attachments"("organizationId", "moveInId");

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_inspectedByUserId_fkey" FOREIGN KEY ("inspectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_handedOverByUserId_fkey" FOREIGN KEY ("handedOverByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_inspection_items" ADD CONSTRAINT "move_in_inspection_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_inspection_items" ADD CONSTRAINT "move_in_inspection_items_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_inventory_items" ADD CONSTRAINT "move_in_inventory_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_inventory_items" ADD CONSTRAINT "move_in_inventory_items_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_meter_readings" ADD CONSTRAINT "move_in_meter_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_meter_readings" ADD CONSTRAINT "move_in_meter_readings_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_key_items" ADD CONSTRAINT "move_in_key_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_key_items" ADD CONSTRAINT "move_in_key_items_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_attachments" ADD CONSTRAINT "move_in_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_attachments" ADD CONSTRAINT "move_in_attachments_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_attachments" ADD CONSTRAINT "move_in_attachments_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "move_in_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_attachments" ADD CONSTRAINT "move_in_attachments_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "move_in_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

