-- CreateEnum
CREATE TYPE "MaintenanceScopeType" AS ENUM ('UNIT', 'BUILDING_COMMON_AREA', 'COMPOUND_COMMON_AREA');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'AIR_CONDITIONING', 'APPLIANCE', 'CARPENTRY', 'PAINTING', 'CIVIL', 'FLOORING', 'DOORS_WINDOWS', 'ELEVATOR', 'POOL', 'LANDSCAPING', 'PEST_CONTROL', 'CLEANING', 'FIRE_SAFETY', 'SECURITY_SYSTEM', 'INTERNET_TELECOM', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "MaintenanceRequestStatus" AS ENUM ('OPEN', 'TRIAGED', 'WORK_ORDER_CREATED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceRequestSource" AS ENUM ('INTERNAL', 'TENANT', 'MOVE_IN_INSPECTION', 'MANAGEMENT', 'SECURITY', 'HOUSEKEEPING', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceReportedByType" AS ENUM ('STAFF', 'TENANT', 'OWNER', 'SECURITY', 'HOUSEKEEPING', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceCancelReason" AS ENUM ('DUPLICATE', 'NOT_NEEDED', 'TENANT_WITHDREW', 'RESOLVED_INFORMALLY', 'DATA_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceWorkOrderStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceHoldReason" AS ENUM ('WAITING_FOR_PART', 'WAITING_FOR_VENDOR', 'WAITING_FOR_TENANT', 'WAITING_FOR_APPROVAL', 'ACCESS_UNAVAILABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceWorkLogType" AS ENUM ('NOTE', 'STATUS_UPDATE', 'DIAGNOSIS', 'WORK_PERFORMED', 'CUSTOMER_UPDATE', 'INTERNAL_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceCostResponsibility" AS ENUM ('UNDETERMINED', 'OWNER', 'TENANT', 'PROPERTY_MANAGEMENT', 'WARRANTY', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceAttachmentType" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'INVOICE_COPY', 'QUOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceAttachmentStage" AS ENUM ('BEFORE', 'DURING', 'AFTER', 'GENERAL');

-- CreateEnum
CREATE TYPE "MaintenanceCostEntryType" AS ENUM ('TRANSPORT', 'EXTERNAL_SERVICE', 'EQUIPMENT_RENTAL', 'MISCELLANEOUS', 'OTHER');

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "scopeType" "MaintenanceScopeType" NOT NULL,
    "compoundId" TEXT,
    "buildingId" TEXT,
    "unitId" TEXT,
    "contractId" TEXT,
    "renterId" TEXT,
    "category" "MaintenanceCategory" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedByType" "MaintenanceReportedByType" NOT NULL,
    "reportedByUserId" TEXT,
    "reportedByName" TEXT,
    "reportedByPhone" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preferredVisitDate" TIMESTAMP(3),
    "preferredTimeWindow" TEXT,
    "permissionToEnter" BOOLEAN,
    "source" "MaintenanceRequestSource" NOT NULL DEFAULT 'INTERNAL',
    "assignedToUserId" TEXT,
    "triagedAt" TIMESTAMP(3),
    "triagedByUserId" TEXT,
    "triageNotes" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" "MaintenanceCancelReason",
    "cancelReasonNote" TEXT,
    "moveInId" TEXT,
    "moveInInspectionItemId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "MaintenanceWorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "MaintenancePriority" NOT NULL,
    "assignedToUserId" TEXT,
    "vendorId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "diagnosedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "diagnosis" TEXT,
    "workPerformed" TEXT,
    "completionNotes" TEXT,
    "requiresFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" "MaintenanceHoldReason",
    "holdReasonNote" TEXT,
    "estimatedCost" DECIMAL(12,2),
    "actualCost" DECIMAL(12,2),
    "costResponsibility" "MaintenanceCostResponsibility" NOT NULL DEFAULT 'UNDETERMINED',
    "verifiedByUserId" TEXT,
    "verificationNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" "MaintenanceCancelReason",
    "cancelReasonNote" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_work_orders_pkey" PRIMARY KEY ("id"),
    -- One responsible party: internal User OR Vendor, never both (defense
    -- in depth alongside the service-layer check - Prisma has no native
    -- CHECK constraint syntax yet, so this is hand-added the same way as
    -- "property_ownerships_at_least_one_asset" in
    -- 20260922090000_owner_ownership_accounting_foundation/migration.sql).
    -- Postgres CHECK constraints can't see other rows, but this is a
    -- single-row invariant so that limitation doesn't apply here.
    CONSTRAINT "maintenance_work_orders_single_responsible_party" CHECK ("assignedToUserId" IS NULL OR "vendorId" IS NULL)
);

-- CreateTable
CREATE TABLE "maintenance_vendors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_vendor_specialties" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_vendor_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "logType" "MaintenanceWorkLogType" NOT NULL,
    "note" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_labor_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT,
    "vendorId" TEXT,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "hourlyRate" DECIMAL(10,2),
    "cost" DECIMAL(12,2) NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_labor_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_part_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "supplierName" TEXT,
    "reference" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_part_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_cost_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "costType" "MaintenanceCostEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT,
    "workOrderId" TEXT,
    "workLogId" TEXT,
    "attachmentType" "MaintenanceAttachmentType" NOT NULL,
    "stage" "MaintenanceAttachmentStage" NOT NULL DEFAULT 'GENERAL',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "storageKey" TEXT,
    "caption" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_status_idx" ON "maintenance_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_priority_idx" ON "maintenance_requests"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_category_idx" ON "maintenance_requests"("organizationId", "category");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_unitId_idx" ON "maintenance_requests"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_compoundId_idx" ON "maintenance_requests"("organizationId", "compoundId");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_buildingId_idx" ON "maintenance_requests"("organizationId", "buildingId");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_reportedAt_idx" ON "maintenance_requests"("organizationId", "reportedAt");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_responseDueAt_idx" ON "maintenance_requests"("organizationId", "responseDueAt");

-- CreateIndex
CREATE INDEX "maintenance_requests_organizationId_resolutionDueAt_idx" ON "maintenance_requests"("organizationId", "resolutionDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_organizationId_requestNumber_key" ON "maintenance_requests"("organizationId", "requestNumber");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_status_idx" ON "maintenance_work_orders"("organizationId", "status");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_requestId_idx" ON "maintenance_work_orders"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_assignedToUserId_idx" ON "maintenance_work_orders"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_vendorId_idx" ON "maintenance_work_orders"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_scheduledStart_idx" ON "maintenance_work_orders"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_organizationId_createdAt_idx" ON "maintenance_work_orders"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_orders_organizationId_workOrderNumber_key" ON "maintenance_work_orders"("organizationId", "workOrderNumber");

-- CreateIndex
CREATE INDEX "maintenance_vendors_organizationId_active_idx" ON "maintenance_vendors"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_vendors_organizationId_vendorNumber_key" ON "maintenance_vendors"("organizationId", "vendorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_vendor_specialties_vendorId_category_key" ON "maintenance_vendor_specialties"("vendorId", "category");

-- CreateIndex
CREATE INDEX "maintenance_work_logs_organizationId_workOrderId_idx" ON "maintenance_work_logs"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_labor_entries_organizationId_workOrderId_idx" ON "maintenance_labor_entries"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_part_entries_organizationId_workOrderId_idx" ON "maintenance_part_entries"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_cost_entries_organizationId_workOrderId_idx" ON "maintenance_cost_entries"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_attachments_organizationId_requestId_idx" ON "maintenance_attachments"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "maintenance_attachments_organizationId_workOrderId_idx" ON "maintenance_attachments"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_attachments_organizationId_workLogId_idx" ON "maintenance_attachments"("organizationId", "workLogId");

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_triagedByUserId_fkey" FOREIGN KEY ("triagedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "move_ins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_moveInInspectionItemId_fkey" FOREIGN KEY ("moveInInspectionItemId") REFERENCES "move_in_inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "maintenance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "maintenance_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_vendor_specialties" ADD CONSTRAINT "maintenance_vendor_specialties_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "maintenance_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_logs" ADD CONSTRAINT "maintenance_work_logs_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_labor_entries" ADD CONSTRAINT "maintenance_labor_entries_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_labor_entries" ADD CONSTRAINT "maintenance_labor_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_labor_entries" ADD CONSTRAINT "maintenance_labor_entries_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "maintenance_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_part_entries" ADD CONSTRAINT "maintenance_part_entries_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_cost_entries" ADD CONSTRAINT "maintenance_cost_entries_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "maintenance_work_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

