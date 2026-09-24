"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { issueInvoice } from "@/lib/invoicing";
import { getScheduleRemaining, recomputeScheduleStatus } from "@/lib/schedule-status";
import { format } from "date-fns";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import type { LineInput } from "@/lib/zatca/vat";
import type { InvoiceLineKind } from "@prisma/client";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { resolveNotificationLanguage } from "@/lib/communications/language";

const EXTRA_CHARGE_VAT_RATE = 15; // Commission/cleaning are always-taxable services, independent of the rent's VAT treatment.

export interface BillableComponent {
  kind: InvoiceLineKind;
  amount: number;
}

/** Which components of a schedule still have something left to invoice, and how much. */
export async function getScheduleBillableComponents(scheduleId: string): Promise<{
  schedule: Awaited<ReturnType<typeof loadScheduleWithContext>>;
  components: BillableComponent[];
}> {
  const { organizationId } = await requirePermission("invoice.create");
  const schedule = await loadScheduleWithContext(scheduleId, organizationId);
  const remaining = await getScheduleRemaining(prisma, scheduleId);

  const components: BillableComponent[] = [];
  if (remaining.rent > 0) components.push({ kind: "RENT", amount: remaining.rent });
  if (remaining.commission > 0) components.push({ kind: "COMMISSION", amount: remaining.commission });
  if (remaining.cleaning > 0) components.push({ kind: "CLEANING", amount: remaining.cleaning });
  if (remaining.securityDeposit > 0) components.push({ kind: "SECURITY_DEPOSIT", amount: remaining.securityDeposit });

  return { schedule, components };
}

function loadScheduleWithContext(scheduleId: string, organizationId: string) {
  return prisma.paymentSchedule.findUniqueOrThrow({
    where: { id: scheduleId, organizationId },
    include: {
      contract: {
        include: {
          unit: { include: { property: true, floor: { include: { building: { include: { compound: true } } } } } },
          renter: true,
        },
      },
    },
  });
}

/**
 * Property name text used only for invoice line *descriptions* (not any
 * amount/VAT/tax calculation). `unit.property` is optional post-migration -
 * fall back to the unit's Compound/Building location when it's absent.
 */
function invoiceLinePropertyNames(unit: {
  property: { name: string; nameAr: string | null } | null;
  floor: { building: { name: string; nameAr: string | null; compound: { name: string; arabicName: string | null } } };
}) {
  if (unit.property) {
    return { propertyName: unit.property.name, propertyNameAr: unit.property.nameAr ?? unit.property.name };
  }
  const { building } = unit.floor;
  const { compound } = building;
  return {
    propertyName: `${compound.name} - ${building.name}`,
    propertyNameAr: `${compound.arabicName ?? compound.name} - ${building.nameAr ?? building.name}`,
  };
}

export async function issueInvoiceForSchedule(formData: FormData) {
  const { organizationId } = await requirePermission("invoice.create");
  const t = getDictionary(await getLocale());
  const scheduleId = String(formData.get("scheduleId"));
  const selectedKinds = formData.getAll("kind").map(String) as InvoiceLineKind[];

  if (selectedKinds.length === 0) {
    throw new Error(t.validation.selectAtLeastOneComponent);
  }

  const schedule = await loadScheduleWithContext(scheduleId, organizationId);
  const remaining = await getScheduleRemaining(prisma, scheduleId);
  const remainingByKind: Record<InvoiceLineKind, number> = {
    RENT: remaining.rent,
    COMMISSION: remaining.commission,
    CLEANING: remaining.cleaning,
    SECURITY_DEPOSIT: remaining.securityDeposit,
    OTHER: 0,
  };

  const { contract } = schedule;
  const { propertyName, propertyNameAr } = invoiceLinePropertyNames(contract.unit);
  const unitNumber = contract.unit.unitNumber;
  const periodLabel = `${format(schedule.periodStart, "yyyy-MM-dd")} – ${format(schedule.periodEnd, "yyyy-MM-dd")}`;

  const lines: Array<LineInput & { description: string; descriptionAr: string; periodStart?: Date; periodEnd?: Date; kind: InvoiceLineKind }> = [];

  for (const kind of selectedKinds) {
    const amount = remainingByKind[kind];
    if (!amount || amount <= 0) continue;

    if (kind === "RENT") {
      lines.push({
        description: `Rent - ${propertyName} / Unit ${unitNumber} (${periodLabel})`,
        descriptionAr: `إيجار - ${propertyNameAr} / وحدة ${unitNumber} (${periodLabel})`,
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
        quantity: 1,
        unitPrice: amount,
        vatRate: contract.vatApplicable ? Number(contract.vatRate) : 0,
        kind,
      });
    } else if (kind === "COMMISSION") {
      lines.push({
        description: `Rental Commission - ${propertyName} / Unit ${unitNumber}`,
        descriptionAr: `عمولة إيجار - ${propertyNameAr} / وحدة ${unitNumber}`,
        quantity: 1,
        unitPrice: amount,
        vatRate: EXTRA_CHARGE_VAT_RATE,
        kind,
      });
    } else if (kind === "CLEANING") {
      lines.push({
        description: `Home Cleaning Package - ${propertyName} / Unit ${unitNumber}`,
        descriptionAr: `باقة تنظيف منزلي - ${propertyNameAr} / وحدة ${unitNumber}`,
        quantity: 1,
        unitPrice: amount,
        vatRate: EXTRA_CHARGE_VAT_RATE,
        kind,
      });
    } else if (kind === "SECURITY_DEPOSIT") {
      // A refundable deposit is not consideration for a taxable supply.
      lines.push({
        description: `Security Deposit - ${propertyName} / Unit ${unitNumber}`,
        descriptionAr: `مبلغ تأمين - ${propertyNameAr} / وحدة ${unitNumber}`,
        quantity: 1,
        unitPrice: amount,
        vatRate: 0,
        kind,
      });
    }
  }

  if (lines.length === 0) {
    throw new Error(t.validation.invoiceAlreadyIssued);
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await issueInvoice(
      {
        organizationId,
        renterId: contract.renterId,
        contractId: contract.id,
        paymentScheduleId: schedule.id,
        dueDate: schedule.dueDate,
        lines,
      },
      tx
    );
    await auditCreate(tx, {
      action: "ISSUE",
      entityType: "Invoice",
      entityId: created.id,
      entityDisplayName: created.invoiceNumber,
      newValues: {
        invoiceNumber: created.invoiceNumber,
        kind: created.kind,
        contractId: created.contractId,
        renterId: created.renterId,
        subtotal: created.subtotal,
        vatAmount: created.vatAmount,
        totalAmount: created.totalAmount,
        lineKinds: selectedKinds,
      },
    });
    return created;
  });

  // Fired strictly after the transaction above has committed (Critical
  // Principle 3) - enqueueCommunicationEvent() never throws, so a
  // notification failure can never affect an already-issued invoice.
  await enqueueCommunicationEvent({
    organizationId,
    eventType: "INVOICE_ISSUED",
    businessEntityType: "Invoice",
    businessEntityId: invoice.id,
    language: resolveNotificationLanguage(await getLocale()),
    variables: {
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency,
      dueDate: invoice.dueDate ? format(invoice.dueDate, "yyyy-MM-dd") : "",
      contractNumber: contract.contractNumber,
      unitNumber,
      renterName: contract.renter.fullName,
    },
    recipients: [buildRenterRecipient(contract.renter)],
  });

  revalidatePath("/invoices");
  revalidatePath("/collections");
  return invoice.id;
}

export async function listInvoices() {
  const { organizationId } = await requirePermission("invoice.view");
  return prisma.invoice.findMany({
    where: { organizationId },
    include: { renter: true, contract: { include: { unit: true } }, payments: true },
    orderBy: { icv: "desc" },
  });
}

export async function getInvoiceById(invoiceId: string) {
  const { organizationId } = await requirePermission("invoice.view");
  return prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId, organizationId },
    include: {
      renter: true,
      lines: true,
      payments: true,
      contract: { include: { unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } } },
      organization: true,
    },
  });
}

export async function cancelInvoice(invoiceId: string) {
  const { organizationId } = await requirePermissionAudited("invoice.cancel", "Invoice", invoiceId);
  await prisma.$transaction(async (tx) => {
    const before = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId, organizationId } });
    const invoice = await tx.invoice.update({
      where: { id: invoiceId, organizationId },
      data: { status: "CANCELLED" },
      include: { lines: { select: { paymentScheduleId: true } } },
    });
    const scheduleIds = Array.from(new Set(invoice.lines.map((l) => l.paymentScheduleId).filter((id): id is string => !!id)));
    for (const scheduleId of scheduleIds) {
      await recomputeScheduleStatus(tx, scheduleId);
    }
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "Invoice",
      entityId: invoice.id,
      entityDisplayName: invoice.invoiceNumber,
      previousValues: { status: before.status },
      newValues: { status: invoice.status },
    });
  });
  revalidatePath("/invoices");
  revalidatePath("/collections");
}
