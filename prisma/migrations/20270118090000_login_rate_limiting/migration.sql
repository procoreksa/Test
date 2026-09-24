-- CreateTable
CREATE TABLE "login_rate_limit_entries" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_rate_limit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_rate_limit_entries_windowStart_idx" ON "login_rate_limit_entries"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "login_rate_limit_entries_bucketKey_windowStart_key" ON "login_rate_limit_entries"("bucketKey", "windowStart");

