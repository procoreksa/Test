import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { nextCounterValue, formatInvoiceNumber } from "@/lib/numbering";
import { computeInvoiceTotals, type LineInput } from "@/lib/zatca/vat";
import { buildZatcaQrBase64 } from "@/lib/zatca/qr";
import { hashInvoicePayload, GENESIS_HASH } from "@/lib/zatca/hash";
import type { InvoiceKind } from "@prisma/client";

export interface IssueInvoiceInput {
  organizationId: string;
  renterId: string;
  contractId?: string | null;
  paymentScheduleIds?: string[];
  lines: Array<LineInput & { description: string; descriptionAr?: string; periodStart?: Date; periodEnd?: Date }>;
  dueDate?: Date;
  notes?: string;
}

export async function issueInvoice(input: IssueInvoiceInput) {
  const { organizationId } = input;

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const renter = await tx.renter.findUniqueOrThrow({ where: { id: input.renterId } });

    const kind: InvoiceKind = renter.vatNumber ? "STANDARD" : "SIMPLIFIED";

    const totals = computeInvoiceTotals(input.lines);
    const icv = await nextCounterValue(tx, organizationId, "invoice");
    const year = new Date().getFullYear();
    const invoiceNumber = formatInvoiceNumber(icv, year);
    const uuid = randomUUID();
    const issueDate = new Date();
    const previousInvoiceHash = org.lastInvoiceHash ?? GENESIS_HASH;

    const invoiceHash = hashInvoicePayload({
      icv,
      invoiceNumber,
      uuid,
      organizationId,
      renterId: input.renterId,
      totalAmount: totals.totalAmount,
      vatAmount: totals.vatAmount,
      previousInvoiceHash,
    });

    const qrCodeBase64 = buildZatcaQrBase64({
      sellerName: org.name,
      vatNumber: org.vatNumber ?? "",
      timestampIso: issueDate.toISOString(),
      invoiceTotal: totals.totalAmount.toFixed(2),
      vatTotal: totals.vatAmount.toFixed(2),
    });

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        invoiceNumber,
        icv,
        uuid,
        kind,
        documentType: "TAX_INVOICE",
        contractId: input.contractId ?? null,
        renterId: input.renterId,
        issueDate,
        supplyDate: issueDate,
        dueDate: input.dueDate,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        status: "ISSUED",
        previousInvoiceHash,
        invoiceHash,
        qrCodeBase64,
        notes: input.notes,
        lines: {
          create: totals.lines.map((line, idx) => ({
            description: input.lines[idx].description,
            descriptionAr: input.lines[idx].descriptionAr,
            periodStart: input.lines[idx].periodStart,
            periodEnd: input.lines[idx].periodEnd,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount ?? 0,
            vatRate: line.vatRate,
            vatAmount: line.vatAmount,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: { lines: true, renter: true },
    });

    await tx.organization.update({
      where: { id: organizationId },
      data: { lastInvoiceHash: invoiceHash },
    });

    if (input.paymentScheduleIds?.length) {
      await tx.paymentSchedule.updateMany({
        where: { id: { in: input.paymentScheduleIds }, organizationId },
        data: { status: "INVOICED", invoiceId: invoice.id },
      });
    }

    return invoice;
  });
}
