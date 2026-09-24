import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedWorkerRequest } from "@/lib/security/worker-auth";
import { getDefaultStorageProviderKindSafe } from "@/lib/documents/providers/factory";
import { handleWorkerRouteError } from "@/lib/api-error";

/**
 * Protected OPERATIONAL health (Prompt 23 - "internal operational
 * health"). The third tier alongside /api/health (liveness) and
 * /api/health/ready (readiness): this one is for an authorized human
 * operator investigating "is anything backed up right now", never a load
 * balancer probe - gated the same way every automation worker route is
 * (Bearer token, timing-safe compare, Step "worker route security review"
 * - reusing `AUTOMATION_WORKER_SECRET` deliberately, per this phase's own
 * "one operational secret may be acceptable for V1 if documented"
 * allowance, rather than inventing a fourth secret for a read-only
 * diagnostic surface).
 *
 * Reports counts and ages only - never a secret, a connection string, a
 * bucket name, or a specific tenant's data (Critical Rule 4). Oldest-
 * pending ages are reported in seconds, not as raw rows, so this endpoint
 * can never be used to enumerate organizations/customers.
 */
export async function GET(request: Request) {
  if (!isAuthorizedWorkerRequest(request, process.env.AUTOMATION_WORKER_SECRET)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const now = new Date();

    const [
      databaseOk,
      automationPendingCount,
      automationFailedCount,
      oldestPendingAutomationJob,
      outboxPendingCount,
      outboxFailedCount,
      oldestPendingOutboxEvent,
      communicationFailedCount,
    ] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      prisma.automationJob.count({ where: { status: "PENDING" } }),
      prisma.automationJob.count({ where: { status: "FAILED" } }),
      prisma.automationJob.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.communicationOutboxEvent.count({ where: { status: "PENDING" } }),
      prisma.communicationOutboxEvent.count({ where: { status: "FAILED" } }),
      prisma.communicationOutboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.communicationMessage.count({ where: { status: "FAILED" } }),
    ]);

    const ageSeconds = (createdAt: Date | undefined | null) =>
      createdAt ? Math.round((now.getTime() - createdAt.getTime()) / 1000) : null;

    return NextResponse.json({
      status: "ok",
      timestamp: now.toISOString(),
      database: { reachable: databaseOk },
      automation: {
        pendingJobs: automationPendingCount,
        failedJobs: automationFailedCount,
        oldestPendingJobAgeSeconds: ageSeconds(oldestPendingAutomationJob?.createdAt),
      },
      outbox: {
        pendingEvents: outboxPendingCount,
        failedEvents: outboxFailedCount,
        oldestPendingEventAgeSeconds: ageSeconds(oldestPendingOutboxEvent?.createdAt),
      },
      communications: { failedMessages: communicationFailedCount },
      storage: { provider: getDefaultStorageProviderKindSafe() },
    });
  } catch (error) {
    return handleWorkerRouteError("ops.health.failed", error);
  }
}
