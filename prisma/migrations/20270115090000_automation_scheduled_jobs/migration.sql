-- CreateEnum
CREATE TYPE "CommunicationOutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomationJobType" AS ENUM ('RENT_DUE_REMINDER', 'CONTRACT_EXPIRY_REMINDER', 'MOVE_IN_REMINDER', 'MOVE_OUT_REMINDER', 'MAINTENANCE_SLA_CHECK', 'COMMUNICATION_RECONCILIATION');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationJobAttemptOutcome" AS ENUM ('COMPLETED', 'SKIPPED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh';

-- CreateTable
CREATE TABLE "communication_outbox_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "CommunicationEventType" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "CommunicationOutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobType" "AutomationJobType" NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_job_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "outcome" "AutomationJobAttemptOutcome",
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_job_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rentReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "contractExpiryReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "moveInReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "moveOutReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceSlaAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_outbox_events_status_availableAt_idx" ON "communication_outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "communication_outbox_events_organizationId_idx" ON "communication_outbox_events"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "communication_outbox_events_organizationId_eventType_eventK_key" ON "communication_outbox_events"("organizationId", "eventType", "eventKey");

-- CreateIndex
CREATE INDEX "automation_jobs_status_availableAt_idx" ON "automation_jobs"("status", "availableAt");

-- CreateIndex
CREATE INDEX "automation_jobs_organizationId_jobType_idx" ON "automation_jobs"("organizationId", "jobType");

-- CreateIndex
CREATE UNIQUE INDEX "automation_jobs_organizationId_jobType_jobKey_key" ON "automation_jobs"("organizationId", "jobType", "jobKey");

-- CreateIndex
CREATE INDEX "automation_job_attempts_jobId_idx" ON "automation_job_attempts"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_settings_organizationId_key" ON "automation_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "communication_outbox_events" ADD CONSTRAINT "communication_outbox_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_job_attempts" ADD CONSTRAINT "automation_job_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

