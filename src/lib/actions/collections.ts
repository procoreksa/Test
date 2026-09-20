"use server";

import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";

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
  const organizationId = await requireOrgId();

  return prisma.paymentSchedule.findMany({
    where: { organizationId },
    include: {
      contract: { include: { unit: { include: { property: true } }, renter: true } },
      invoiceLines: { include: { invoice: { select: { id: true, status: true } } }, distinct: ["invoiceId"] },
    },
    orderBy: { dueDate: "asc" },
  });
}
