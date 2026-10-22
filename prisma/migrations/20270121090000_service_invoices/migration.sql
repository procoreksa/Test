-- CreateEnum
CREATE TYPE "InvoiceCategory" AS ENUM ('RENTAL', 'SERVICE');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "category" "InvoiceCategory" NOT NULL DEFAULT 'RENTAL',
ADD COLUMN     "serviceId" TEXT;

-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "defaultPrice" DECIMAL(12,2),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_catalog_items_organizationId_idx" ON "service_catalog_items"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_organizationId_name_key" ON "service_catalog_items"("organizationId", "name");

-- CreateIndex
CREATE INDEX "invoices_organizationId_category_issueDate_idx" ON "invoices"("organizationId", "category", "issueDate");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_catalog_items" ADD CONSTRAINT "service_catalog_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

