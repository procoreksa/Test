import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextCounterValue, formatInvoiceNumber } from "@/lib/numbering";
import { computeInvoiceTotals, type LineInput } from "@/lib/zatca/vat";
import { buildZatcaQrBase64 } from "@/lib/zatca/qr";
import { hashInvoicePayload, GENESIS_HASH } from "@/lib/zatca/hash";
import { recomputeScheduleStatus } from "@/lib/schedule-status";
import type { InvoiceKind, InvoiceLineKind } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface IssueInvoiceInput {
  organizationId: string;
  renterId: string;
  contractId?: string | null;
  /** All lines in one invoice must belong to the same schedule (or none). */
  paymentScheduleId?: string | null;
  /** Reference-only traceability to a Security Deposit Settlement's "Additional Tenant Amount Due" receivable (see docs/SECURITY-DEPOSIT-SETTLEMENT.md) - never used to change invoicing/VAT/numbering behavior itself. */
  settlementId?: string | null;
  lines: Array<
    LineInput & {
      description: string;
      descriptionAr?: string;
      periodStart?: Date;
      periodEnd?: Date;
      kind?: InvoiceLineKind;
    }
  >;
  dueDate?: Date;
  notes?: string;
}

/**
 * Optionally accepts an already-open transaction client (`existingTx`) so a
 * caller that needs to write an audit-log entry atomically alongside the
 * invoice (see docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Database transaction
 * strategy") can wrap both in one `prisma.$transaction` and pass it
 * straight through here, instead of nesting a second transaction inside
 * the one this function would otherwise open itself. Callers that don't
 * care (e.g. the demo-data seed script) can keep calling this with just
 * `input`, exactly as before.
 */
export async function issueInvoice(input: IssueInvoiceInput, existingTx?: Tx) {
  const { organizationId } = input;

  const run = async (tx: Tx) => {
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
        settlementId: input.settlementId ?? null,
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
            paymentScheduleId: input.paymentScheduleId ?? null,
            kind: input.lines[idx].kind ?? "OTHER",
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

    if (input.paymentScheduleId) {
      await recomputeScheduleStatus(tx, input.paymentScheduleId);
    }

    return invoice;
  };

  return existingTx ? run(existingTx) : prisma.$transaction(run);
}
