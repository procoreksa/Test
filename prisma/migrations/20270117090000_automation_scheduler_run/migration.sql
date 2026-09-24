-- CreateTable
CREATE TABLE "automation_scheduler_runs" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultJson" JSONB NOT NULL,

    CONSTRAINT "automation_scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_scheduler_runs_ranAt_idx" ON "automation_scheduler_runs"("ranAt");

