"use server";

import { prisma } from "@/lib/prisma";
import { requireOrgId, requirePermission } from "@/lib/session";

/**
 * Internal housekeeping (marks stale PENDING schedules/invoices as OVERDUE
 * based on the current date) - not a user-initiated action, so it is not
 * permission-gated. It's called as a side effect of the *.view-gated reads
 * below to keep their data fresh; gating it separately would just block
 * lower-privileged roles from seeing up-to-date overdue statuses.
 */
export async function syncOverdueStatuses() {
  const organizationId = await requireOrgId();
  const now = new Date();

  await prisma.paymentSchedule.updateMany({
    where: { organizationId, status: "PENDING", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });
  await prisma.invoice.updateMany({
    where: { organizationId, status: "ISSUED", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });
}

export async function listCollections() {
  await syncOverdueStatuses();
  const { organizationId } = await requirePermission("invoice.view");

  return prisma.paymentSchedule.findMany({
    where: { organizationId },
    include: {
      contract: { include: { unit: { include: { property: true } }, renter: true } },
      invoiceLines: { include: { invoice: { select: { id: true, status: true } } }, distinct: ["invoiceId"] },
    },
    orderBy: { dueDate: "asc" },
  });
}
