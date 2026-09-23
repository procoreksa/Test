-- CreateEnum
CREATE TYPE "OwnerPortalAccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateTable
CREATE TABLE "owner_portal_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "OwnerPortalAccountStatus" NOT NULL DEFAULT 'INVITED',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspendedByUserId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "disabledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_accounts_ownerId_key" ON "owner_portal_accounts"("ownerId");

-- CreateIndex
CREATE INDEX "owner_portal_accounts_organizationId_status_idx" ON "owner_portal_accounts"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_accounts_organizationId_emailNormalized_key" ON "owner_portal_accounts"("organizationId", "emailNormalized");

-- AddForeignKey
ALTER TABLE "owner_portal_accounts" ADD CONSTRAINT "owner_portal_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_portal_accounts" ADD CONSTRAINT "owner_portal_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

