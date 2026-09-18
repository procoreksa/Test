import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Atomically increments a per-organization named counter and returns the new
 * value. Used for invoice ICV (ZATCA's ever-increasing Invoice Counter
 * Value), human-readable invoice numbers, contract numbers, and receipt
 * numbers — each keyed independently so none of them collide or skip.
 */
export async function nextCounterValue(
  tx: Tx,
  organizationId: string,
  key: string
): Promise<number> {
  const counter = await tx.counter.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

export function formatInvoiceNumber(icv: number, year: number): string {
  return `INV-${year}-${String(icv).padStart(6, "0")}`;
}

export function formatContractNumber(seq: number, year: number): string {
  return `CTR-${year}-${String(seq).padStart(5, "0")}`;
}

export function formatReceiptNumber(seq: number, year: number): string {
  return `RCT-${year}-${String(seq).padStart(6, "0")}`;
}
