-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommunicationEventType" AS ENUM ('INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'MAINTENANCE_REQUEST_CREATED', 'MAINTENANCE_SCHEDULED', 'MAINTENANCE_COMPLETED', 'MOVE_IN_SCHEDULED', 'MOVE_OUT_SCHEDULED', 'SECURITY_DEPOSIT_SETTLEMENT_POSTED', 'SECURITY_DEPOSIT_REFUND_RECORDED', 'CONTRACT_CREATED', 'CONTRACT_RENEWED', 'CONTRACT_TERMINATED', 'RESERVATION_CONFIRMED', 'TENANT_PORTAL_ACCOUNT_INVITED', 'OWNER_PORTAL_ACCOUNT_INVITED', 'CORPORATE_ALLOCATION_ACTIVATED');

-- CreateEnum
CREATE TYPE "CommunicationRecipientStrategy" AS ENUM ('RENTER', 'OWNER', 'CORPORATE_PRIMARY_CONTACT', 'CORPORATE_HOUSING_CONTACT', 'ASSIGNED_STAFF', 'SPECIFIC_INTERNAL_USER');

-- CreateEnum
CREATE TYPE "CommunicationRecipientType" AS ENUM ('RENTER', 'OWNER', 'CORPORATE_CONTACT', 'CORPORATE_OCCUPANT', 'INTERNAL_USER');

-- CreateEnum
CREATE TYPE "CommunicationTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommunicationMessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationDeliveryAttemptStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "CommunicationEventType" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "language" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CommunicationTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "variables" TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "CommunicationEventType" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "recipientStrategy" "CommunicationRecipientStrategy" NOT NULL,
    "specificUserId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "CommunicationEventType" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "language" TEXT NOT NULL,
    "status" "CommunicationMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "recipientType" "CommunicationRecipientType" NOT NULL,
    "renterId" TEXT,
    "ownerId" TEXT,
    "corporateContactId" TEXT,
    "corporateOccupantId" TEXT,
    "internalUserId" TEXT,
    "destinationRaw" TEXT NOT NULL,
    "destinationMasked" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "renderedSubject" TEXT,
    "renderedBody" TEXT NOT NULL,
    "variablesSnapshot" JSONB NOT NULL,
    "businessEntityType" TEXT NOT NULL,
    "businessEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_delivery_attempts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "CommunicationDeliveryAttemptStatus" NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_preferences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientType" "CommunicationRecipientType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_templates_organizationId_eventType_channel_la_idx" ON "communication_templates"("organizationId", "eventType", "channel", "language", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_organizationId_eventType_channel_la_key" ON "communication_templates"("organizationId", "eventType", "channel", "language", "version");

-- CreateIndex
CREATE INDEX "communication_rules_organizationId_eventType_channel_isEnab_idx" ON "communication_rules"("organizationId", "eventType", "channel", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "communication_rules_organizationId_eventType_channel_recipi_key" ON "communication_rules"("organizationId", "eventType", "channel", "recipientStrategy");

-- CreateIndex
CREATE INDEX "communication_messages_organizationId_status_nextAttemptAt_idx" ON "communication_messages"("organizationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "communication_messages_organizationId_eventType_idx" ON "communication_messages"("organizationId", "eventType");

-- CreateIndex
CREATE INDEX "communication_messages_organizationId_createdAt_idx" ON "communication_messages"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "communication_messages_organizationId_businessEntityType_bu_idx" ON "communication_messages"("organizationId", "businessEntityType", "businessEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "communication_messages_organizationId_idempotencyKey_key" ON "communication_messages"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "communication_delivery_attempts_organizationId_messageId_idx" ON "communication_delivery_attempts"("organizationId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "communication_preferences_organizationId_recipientType_reci_key" ON "communication_preferences"("organizationId", "recipientType", "recipientId", "channel");

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_rules" ADD CONSTRAINT "communication_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_rules" ADD CONSTRAINT "communication_rules_specificUserId_fkey" FOREIGN KEY ("specificUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_rules" ADD CONSTRAINT "communication_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "renters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_corporateContactId_fkey" FOREIGN KEY ("corporateContactId") REFERENCES "corporate_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_corporateOccupantId_fkey" FOREIGN KEY ("corporateOccupantId") REFERENCES "corporate_occupants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "communication_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_delivery_attempts" ADD CONSTRAINT "communication_delivery_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_delivery_attempts" ADD CONSTRAINT "communication_delivery_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communication_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prisma's schema DSL cannot express a partial/filtered unique index. This
-- DB-enforces "at most one ACTIVE CommunicationTemplate version per
-- (organization, eventType, channel, language)" - application code
-- (activateTemplate()) already enforces this by archiving the prior ACTIVE
-- version in the same transaction, but this index is the real backstop
-- against a race between two concurrent activations.
CREATE UNIQUE INDEX "communication_templates_one_active_per_key"
ON "communication_templates" ("organizationId", "eventType", "channel", "language")
WHERE "status" = 'ACTIVE';
