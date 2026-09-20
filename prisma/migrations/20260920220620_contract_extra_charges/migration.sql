-- CreateEnum
CREATE TYPE "ExtraChargesMode" AS ENUM ('ONE_TIME', 'SPLIT');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "cleaningAmount" DECIMAL(12,2),
ADD COLUMN     "commissionAmount" DECIMAL(12,2),
ADD COLUMN     "extraChargesMode" "ExtraChargesMode" NOT NULL DEFAULT 'ONE_TIME';

-- AlterTable
ALTER TABLE "payment_schedules" ADD COLUMN     "cleaningAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
