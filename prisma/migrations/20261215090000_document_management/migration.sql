-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('RENTER', 'OWNER', 'CONTRACT', 'UNIT', 'COMPOUND', 'BUILDING', 'INVOICE', 'PAYMENT', 'MAINTENANCE_REQUEST', 'MOVE_IN', 'MOVE_OUT', 'SECURITY_DEPOSIT_SETTLEMENT', 'CORPORATE_ACCOUNT', 'CORPORATE_OCCUPANT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'IDENTITY', 'OWNERSHIP_DEED', 'BANK_DETAIL', 'MOVE_IN_EVIDENCE', 'MOVE_OUT_EVIDENCE', 'SECURITY_DEPOSIT_EVIDENCE', 'MAINTENANCE_EVIDENCE', 'PAYMENT_RECEIPT', 'CORPORATE_ACCOUNT_DOCUMENT', 'BUILDING_PLAN', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL_ONLY', 'TENANT_VISIBLE', 'OWNER_VISIBLE');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL_DEV', 'S3_COMPATIBLE');

-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('NOT_SCANNED', 'CLEAN', 'BLOCKED', 'FAILED');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "securityContextEntityType" "DocumentEntityType" NOT NULL,
    "securityContextEntityId" TEXT NOT NULL,
    "securityContextChangedAt" TIMESTAMP(3),
    "securityContextChangedByUserId" TEXT,
    "currentVersionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "scanStatus" "DocumentScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_currentVersionId_key" ON "documents"("currentVersionId");

-- CreateIndex
CREATE INDEX "documents_organizationId_status_idx" ON "documents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "documents_organizationId_securityContextEntityType_security_idx" ON "documents"("organizationId", "securityContextEntityType", "securityContextEntityId");

-- CreateIndex
CREATE INDEX "documents_organizationId_category_idx" ON "documents"("organizationId", "category");

-- CreateIndex
CREATE INDEX "documents_organizationId_createdAt_idx" ON "documents"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "documents_organizationId_documentNumber_key" ON "documents"("organizationId", "documentNumber");

-- CreateIndex
CREATE INDEX "document_versions_organizationId_documentId_idx" ON "document_versions"("organizationId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key" ON "document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "document_links_organizationId_entityType_entityId_idx" ON "document_links"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_documentId_entityType_entityId_key" ON "document_links"("documentId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

