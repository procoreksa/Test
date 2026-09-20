/*
  Warnings:

  - You are about to drop the column `invoiceId` on the `payment_schedules` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('RENT', 'COMMISSION', 'CLEANING', 'SECURITY_DEPOSIT', 'OTHER');

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'RENEWED';

-- AlterEnum
ALTER TYPE "ScheduleStatus" ADD VALUE 'PARTIALLY_INVOICED';

-- DropForeignKey
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_invoiceId_fkey";

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "kind" "InvoiceLineKind" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "paymentScheduleId" TEXT;

-- DataMigration: preserve the invoice<->schedule link (previously a single FK
-- on payment_schedules) on invoice_lines before dropping that column, and
-- infer each historical line's kind from its description prefix so existing
-- schedules' invoiced-amount aggregation stays correct after the cutover.
UPDATE "invoice_lines" il
SET "paymentScheduleId" = ps."id"
FROM "payment_schedules" ps
WHERE ps."invoiceId" = il."invoiceId";

UPDATE "invoice_lines"
SET "kind" = CASE
  WHEN "description" LIKE 'Rent -%' THEN 'RENT'::"InvoiceLineKind"
  WHEN "description" LIKE 'Rental Commission%' THEN 'COMMISSION'::"InvoiceLineKind"
  WHEN "description" LIKE 'Home Cleaning Package%' THEN 'CLEANING'::"InvoiceLineKind"
  ELSE 'OTHER'::"InvoiceLineKind"
END
WHERE "paymentScheduleId" IS NOT NULL;

-- AlterTable
ALTER TABLE "payment_schedules" DROP COLUMN "invoiceId",
ADD COLUMN     "securityDepositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "invoice_lines_paymentScheduleId_idx" ON "invoice_lines"("paymentScheduleId");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "payment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
