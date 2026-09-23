-- CreateEnum
CREATE TYPE "TenantPortalAccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateTable
CREATE TABLE "tenant_portal_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "TenantPortalAccountStatus" NOT NULL DEFAULT 'INVITED',
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

    CONSTRAINT "tenant_portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_portal_accounts_renterId_key" ON "tenant_portal_accounts"("renterId");

-- CreateIndex
CREATE INDEX "tenant_portal_accounts_organizationId_status_idx" ON "tenant_portal_accounts"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_portal_accounts_organizationId_emailNormalized_key" ON "tenant_portal_accounts"("organizationId", "emailNormalized");

-- AddForeignKey
ALTER TABLE "tenant_portal_accounts" ADD CONSTRAINT "tenant_portal_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_portal_accounts" ADD CONSTRAINT "tenant_portal_accounts_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

