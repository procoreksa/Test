import { prisma } from "@/lib/prisma";
import { safeRate } from "@/lib/executive/format";

/**
 * Communications Health (Step 49) - SENT != DELIVERED (Critical Principle
 * 2/3): a message can be SENT by the provider and never reach DELIVERED
 * (bounced address, provider-side failure after acceptance), so "delivery
 * rate" is computed against provider-confirmed DELIVERED, never against
 * SENT treated as a proxy for success. Counts CommunicationMessage rows by
 * `createdAt` in the period (when the message was enqueued/attempted, the
 * business event that generated it), matching this module's own existing
 * dashboard/report queries.
 */
export interface CommunicationsSummary {
  sent: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
}

export async function getCommunicationsSummary(organizationId: string, period: { gte: Date; lt: Date }): Promise<CommunicationsSummary> {
  const [sent, delivered, failed] = await Promise.all([
    prisma.communicationMessage.count({ where: { organizationId, createdAt: period, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
    prisma.communicationMessage.count({ where: { organizationId, createdAt: period, status: { in: ["DELIVERED", "READ"] } } }),
    prisma.communicationMessage.count({ where: { organizationId, createdAt: period, status: "FAILED" } }),
  ]);
  return { sent, delivered, failed, deliveryRate: safeRate(delivered, sent) };
}
