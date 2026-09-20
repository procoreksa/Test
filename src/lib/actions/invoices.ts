"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { issueInvoice } from "@/lib/invoicing";
import { format } from "date-fns";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { LineInput } from "@/lib/zatca/vat";

const EXTRA_CHARGE_VAT_RATE = 15; // Commission/cleaning are always-taxable services, independent of the rent's VAT treatment.

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
  const propertyName = contract.unit.property.name;
  const propertyNameAr = contract.unit.property.nameAr ?? contract.unit.property.name;
  const unitNumber = contract.unit.unitNumber;
  const periodLabel = `${format(schedule.periodStart, "yyyy-MM-dd")} – ${format(schedule.periodEnd, "yyyy-MM-dd")}`;

  const lines: Array<LineInput & { description: string; descriptionAr: string; periodStart?: Date; periodEnd?: Date }> = [];

  if (Number(schedule.rentAmount) > 0) {
    lines.push({
      description: `Rent - ${propertyName} / Unit ${unitNumber} (${periodLabel})`,
      descriptionAr: `إيجار - ${propertyNameAr} / وحدة ${unitNumber} (${periodLabel})`,
      periodStart: schedule.periodStart,
      periodEnd: schedule.periodEnd,
      quantity: 1,
      unitPrice: Number(schedule.rentAmount),
      vatRate: contract.vatApplicable ? Number(contract.vatRate) : 0,
    });
  }

  if (Number(schedule.commissionAmount) > 0) {
    lines.push({
      description: `Rental Commission - ${propertyName} / Unit ${unitNumber}`,
      descriptionAr: `عمولة إيجار - ${propertyNameAr} / وحدة ${unitNumber}`,
      quantity: 1,
      unitPrice: Number(schedule.commissionAmount),
      vatRate: EXTRA_CHARGE_VAT_RATE,
    });
  }

  if (Number(schedule.cleaningAmount) > 0) {
    lines.push({
      description: `Home Cleaning Package - ${propertyName} / Unit ${unitNumber}`,
      descriptionAr: `باقة تنظيف منزلي - ${propertyNameAr} / وحدة ${unitNumber}`,
      quantity: 1,
      unitPrice: Number(schedule.cleaningAmount),
      vatRate: EXTRA_CHARGE_VAT_RATE,
    });
  }

  const invoice = await issueInvoice({
    organizationId,
    renterId: contract.renterId,
    contractId: contract.id,
    paymentScheduleIds: [schedule.id],
    dueDate: schedule.dueDate,
    lines,
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
