"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { issueInvoice } from "@/lib/invoicing";
import { format } from "date-fns";
import { getLocale, getDictionary } from "@/lib/i18n";

export async function issueInvoiceForSchedule(scheduleId: string) {
  const organizationId = await requireOrgId();
  const t = getDictionary(await getLocale());

  const schedule = await prisma.paymentSchedule.findUniqueOrThrow({
    where: { id: scheduleId, organizationId },
    include: { contract: { include: { unit: { include: { property: true } }, renter: true } } },
  });

  if (schedule.status === "INVOICED" || schedule.status === "PAID") {
    throw new Error(t.validation.invoiceAlreadyIssued);
  }

  const { contract } = schedule;
  const periodLabel = `${format(schedule.periodStart, "yyyy-MM-dd")} إلى ${format(schedule.periodEnd, "yyyy-MM-dd")}`;

  const invoice = await issueInvoice({
    organizationId,
    renterId: contract.renterId,
    contractId: contract.id,
    paymentScheduleIds: [schedule.id],
    dueDate: schedule.dueDate,
    lines: [
      {
        description: `Rent - ${contract.unit.property.name} / Unit ${contract.unit.unitNumber} (${periodLabel})`,
        descriptionAr: `إيجار - ${contract.unit.property.nameAr ?? contract.unit.property.name} / وحدة ${contract.unit.unitNumber} (${periodLabel})`,
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
        quantity: 1,
        unitPrice: Number(schedule.amount),
        vatRate: contract.vatApplicable ? Number(contract.vatRate) : 0,
      },
    ],
  });

  revalidatePath("/invoices");
  revalidatePath("/collections");
  return invoice.id;
}

export async function listInvoices() {
  const organizationId = await requireOrgId();
  return prisma.invoice.findMany({
    where: { organizationId },
    include: { renter: true, contract: { include: { unit: true } }, payments: true },
    orderBy: { icv: "desc" },
  });
}

export async function getInvoiceById(invoiceId: string) {
  const organizationId = await requireOrgId();
  return prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId, organizationId },
    include: {
      renter: true,
      lines: true,
      payments: true,
      contract: { include: { unit: { include: { property: true } } } },
      organization: true,
    },
  });
}

export async function cancelInvoice(invoiceId: string) {
  const organizationId = await requireOrgId();
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.update({
      where: { id: invoiceId, organizationId },
      data: { status: "CANCELLED" },
    });
    await tx.paymentSchedule.updateMany({
      where: { invoiceId: invoice.id },
      data: { status: "PENDING", invoiceId: null },
    });
  });
  revalidatePath("/invoices");
  revalidatePath("/collections");
}
