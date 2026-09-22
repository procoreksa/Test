-- Leasing Offer Management (additive only)
--
-- Adds three new enums (OfferStatus, ApprovalStatus, OfferRejectReason) and
-- one new table (leasing_offers). No existing table, column, index, or
-- constraint is altered - verified additive-only via
-- `prisma migrate diff --from-url <dev-db> --to-schema-datamodel schema.prisma`.
--
-- FK onDelete behavior:
--   organizationId -> organizations: CASCADE (org deletion removes its offers)
--   leadId         -> leads:         CASCADE (matches Viewing.leadId)
--   viewingId      -> viewings:      SET NULL (optional link; Step 10 requires
--                                    a direct Offer-from-Lead path with no
--                                    Viewing at all to remain possible)
--   unitId         -> units:         RESTRICT (a Unit with live commercial
--                                    offers against it cannot be deleted out
--                                    from under them - matches Contract.unitId)
--   assignedToUserId -> users:       SET NULL (matches Lead/Viewing's own
--                                    assignedToUserId - an agent leaving the
--                                    org never orphans offer history)
--   parentOfferId  -> leasing_offers: SET NULL (matches
--                                    Contract.renewedFromContractId)

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferRejectReason" AS ENUM ('PRICE', 'PAYMENT_TERMS', 'UNIT', 'LOCATION', 'TIMING', 'COMPETITOR', 'CUSTOMER_CANCELLED', 'OTHER');

-- CreateTable
CREATE TABLE "leasing_offers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "offerNumber" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "leadId" TEXT NOT NULL,
    "viewingId" TEXT,
    "unitId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "annualRent" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "netAnnualRent" DECIMAL(12,2) NOT NULL,
    "securityDeposit" DECIMAL(12,2) NOT NULL,
    "contractFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leasingCommissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leasingCommissionRate" DECIMAL(5,2),
    "commissionVatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "commissionVatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalInitialPayment" DECIMAL(12,2) NOT NULL,
    "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'ANNUAL',
    "leaseStartDate" TIMESTAMP(3),
    "leaseDurationMonths" INTEGER NOT NULL DEFAULT 12,
    "furnishedStatus" "FurnishingPreference" NOT NULL DEFAULT 'UNFURNISHED',
    "specialTerms" TEXT,
    "internalNotes" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "rejectReason" "OfferRejectReason",
    "rejectReasonNote" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "parentOfferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leasing_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leasing_offers_parentOfferId_key" ON "leasing_offers"("parentOfferId");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_status_idx" ON "leasing_offers"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_leadId_idx" ON "leasing_offers"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_unitId_idx" ON "leasing_offers"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_assignedToUserId_idx" ON "leasing_offers"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_validUntil_idx" ON "leasing_offers"("organizationId", "validUntil");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_createdAt_idx" ON "leasing_offers"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "leasing_offers_organizationId_offerNumber_idx" ON "leasing_offers"("organizationId", "offerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "leasing_offers_organizationId_offerNumber_versionNumber_key" ON "leasing_offers"("organizationId", "offerNumber", "versionNumber");

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_viewingId_fkey" FOREIGN KEY ("viewingId") REFERENCES "viewings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_offers" ADD CONSTRAINT "leasing_offers_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "leasing_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
