"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { issueInvoice } from "@/lib/invoicing";
import { nextCounterValue, formatReceiptNumber } from "@/lib/numbering";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate } from "@/lib/audit";

/**
 * Standalone service invoices (docs/SERVICE-INVOICES.md). These are full
 * ZATCA tax invoices - same numbering, hash chain, QR and VAT report as
 * rent invoices - but carry `category: "SERVICE"`, are never tied to a
 * contract or payment schedule, and are excluded from the renter's rent
 * statement and tenant/corporate rent balances. They have their own
 * report instead (getServicesReport below).
 */

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE"] as const;

// ---------------------------------------------------------------------------
// Service catalog
// ---------------------------------------------------------------------------

export async function listServiceCatalog(options?: { includeInactive?: boolean }) {
  const { organizationId } = await requirePermission("invoice.view");
  return prisma.serviceCatalogItem.findMany({
    where: { organizationId, ...(options?.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

function catalogItemSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    name: z.string().trim().min(1, t.serviceInvoices.validation.nameRequired),
    nameAr: z.string().trim().optional(),
    defaultPrice: z.coerce.number().nonnegative().optional(),
    vatRate: z.coerce.number().min(0).max(100),
  });
}

export async function createServiceCatalogItem(formData: FormData): Promise<{ error?: string }> {
  const { organizationId } = await requirePermission("invoice.create");
  const t = getDictionary(await getLocale());
  const parsed = catalogItemSchema(t).safeParse({
    name: formData.get("name"),
    nameAr: formData.get("nameAr") || undefined,
    defaultPrice: formData.get("defaultPrice") || undefined,
    vatRate: formData.get("vatRate") || 15,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const existing = await prisma.serviceCatalogItem.findUnique({
    where: { organizationId_name: { organizationId, name: parsed.data.name } },
  });
  if (existing) return { error: t.serviceInvoices.validation.nameTaken };

  await prisma.$transaction(async (tx) => {
    const item = await tx.serviceCatalogItem.create({
      data: {
        organizationId,
        name: parsed.data.name,
        nameAr: parsed.data.nameAr || null,
        defaultPrice: parsed.data.defaultPrice ?? null,
        vatRate: parsed.data.vatRate,
      },
    });
    await auditCreate(tx, {
      entityType: "ServiceCatalogItem",
      entityId: item.id,
      entityDisplayName: item.name,
      newValues: { name: item.name, nameAr: item.nameAr, defaultPrice: item.defaultPrice, vatRate: item.vatRate },
    });
  });

  revalidatePath("/service-invoices");
  return {};
}

export async function setServiceCatalogItemActive(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("invoice.create");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";

  await prisma.$transaction(async (tx) => {
    const before = await tx.serviceCatalogItem.findUniqueOrThrow({ where: { id, organizationId } });
    const after = await tx.serviceCatalogItem.update({ where: { id, organizationId }, data: { isActive: active } });
    await auditUpdate(tx, {
      entityType: "ServiceCatalogItem",
      entityId: after.id,
      entityDisplayName: after.name,
      before: { isActive: before.isActive },
      after: { isActive: after.isActive },
    });
  });

  revalidatePath("/service-invoices");
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

export async function listServiceInvoiceCustomers() {
  const { organizationId } = await requirePermission("invoice.view");
  return prisma.renter.findMany({
    where: { organizationId },
    select: { id: true, fullName: true, fullNameAr: true, phone: true },
    orderBy: { createdAt: "desc" },
  });
}

function serviceInvoiceSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    renterId: z.string().min(1, t.serviceInvoices.validation.customerRequired),
    serviceId: z.string().min(1, t.serviceInvoices.validation.serviceRequired),
    description: z.string().trim().optional(),
    quantity: z.coerce.number().positive(t.serviceInvoices.validation.quantityPositive),
    unitPrice: z.coerce.number().positive(t.serviceInvoices.validation.amountPositive),
    vatRate: z.coerce.number().min(0).max(100),
    // "ON_ACCOUNT" = issued unpaid (customer pays later); anything else
    // records a full payment against the invoice in the same transaction.
    paymentMethod: z.enum(["ON_ACCOUNT", ...PAYMENT_METHODS]),
    referenceNumber: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  });
}

export async function issueServiceInvoice(formData: FormData): Promise<{ error?: string; invoiceId?: string }> {
  const { organizationId } = await requirePermission("invoice.create");
  const t = getDictionary(await getLocale());
  const parsed = serviceInvoiceSchema(t).safeParse({
    renterId: formData.get("renterId"),
    serviceId: formData.get("serviceId"),
    description: formData.get("description") || undefined,
    quantity: formData.get("quantity") || 1,
    unitPrice: formData.get("unitPrice"),
    vatRate: formData.get("vatRate") ?? 15,
    paymentMethod: formData.get("paymentMethod"),
    referenceNumber: formData.get("referenceNumber") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const input = parsed.data;

  const [renter, service] = await Promise.all([
    prisma.renter.findFirst({ where: { id: input.renterId, organizationId }, select: { id: true } }),
    prisma.serviceCatalogItem.findFirst({ where: { id: input.serviceId, organizationId, isActive: true } }),
  ]);
  if (!renter) return { error: t.serviceInvoices.validation.customerRequired };
  if (!service) return { error: t.serviceInvoices.validation.serviceRequired };

  const extra = input.description ? ` - ${input.description}` : "";

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await issueInvoice(
      {
        organizationId,
        renterId: renter.id,
        category: "SERVICE",
        serviceId: service.id,
        notes: input.notes,
        lines: [
          {
            description: `${service.name}${extra}`,
            descriptionAr: `${service.nameAr || service.name}${extra}`,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            vatRate: input.vatRate,
            kind: "OTHER",
          },
        ],
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
        category: created.category,
        kind: created.kind,
        renterId: created.renterId,
        serviceId: service.id,
        subtotal: created.subtotal,
        vatAmount: created.vatAmount,
        totalAmount: created.totalAmount,
        paymentMethod: input.paymentMethod,
      },
    });

    if (input.paymentMethod !== "ON_ACCOUNT") {
      const seq = await nextCounterValue(tx, organizationId, "receipt");
      const payment = await tx.payment.create({
        data: {
          organizationId,
          invoiceId: created.id,
          renterId: created.renterId,
          receiptNumber: formatReceiptNumber(seq, new Date().getFullYear()),
          amount: created.totalAmount,
          paymentDate: created.issueDate,
          method: input.paymentMethod,
          referenceNumber: input.referenceNumber,
        },
      });
      await tx.invoice.update({ where: { id: created.id }, data: { paidAmount: created.totalAmount, status: "PAID" } });
      await auditCreate(tx, {
        action: "PAYMENT_RECORDED",
        entityType: "Payment",
        entityId: payment.id,
        entityDisplayName: payment.receiptNumber,
        newValues: { invoiceId: payment.invoiceId, amount: payment.amount, method: payment.method, paymentDate: payment.paymentDate, referenceNumber: payment.referenceNumber },
      });
    }

    return created;
  });

  revalidatePath("/service-invoices");
  revalidatePath("/payments");
  return { invoiceId: invoice.id };
}

export async function listServiceInvoices() {
  const { organizationId } = await requirePermission("invoice.view");
  return prisma.invoice.findMany({
    where: { organizationId, category: "SERVICE" },
    include: { renter: true, service: true, payments: { where: { status: "POSTED", amount: { gt: 0 } }, select: { method: true } } },
    orderBy: { icv: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface ServicesReportFilters {
  from: Date;
  to: Date;
  renterId?: string;
  serviceId?: string;
}

export async function getServicesReport(filters: ServicesReportFilters) {
  const { organizationId } = await requirePermission("report.view");
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      category: "SERVICE",
      status: { not: "CANCELLED" },
      issueDate: { gte: filters.from, lte: filters.to },
      ...(filters.renterId ? { renterId: filters.renterId } : {}),
      ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
    },
    include: {
      renter: { select: { fullName: true, fullNameAr: true } },
      service: { select: { name: true, nameAr: true } },
      lines: { select: { description: true, descriptionAr: true } },
      payments: { where: { status: "POSTED", amount: { gt: 0 } }, select: { method: true } },
    },
    orderBy: { issueDate: "asc" },
  });

  const zero = new Prisma.Decimal(0);
  const totals = invoices.reduce(
    (acc, inv) => ({
      subtotal: acc.subtotal.plus(inv.subtotal),
      vatAmount: acc.vatAmount.plus(inv.vatAmount),
      totalAmount: acc.totalAmount.plus(inv.totalAmount),
      paidAmount: acc.paidAmount.plus(inv.paidAmount),
    }),
    { subtotal: zero, vatAmount: zero, totalAmount: zero, paidAmount: zero }
  );

  return {
    invoices,
    totals: {
      count: invoices.length,
      subtotal: Number(totals.subtotal),
      vatAmount: Number(totals.vatAmount),
      totalAmount: Number(totals.totalAmount),
      paidAmount: Number(totals.paidAmount),
      outstanding: Number(totals.totalAmount.minus(totals.paidAmount)),
    },
  };
}
