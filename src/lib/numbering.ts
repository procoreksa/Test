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

/** No year component, per the CRM brief's own example ("LEAD-000001") - unlike invoice/contract/receipt numbers, lead numbers are not a legal/tax document series. */
export function formatLeadNumber(seq: number): string {
  return `LEAD-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatLeadNumber() - a viewing number is not a legal/tax document series either. */
export function formatViewingNumber(seq: number): string {
  return `VIEW-${String(seq).padStart(6, "0")}`;
}

/**
 * No year component, matching formatLeadNumber()/formatViewingNumber() - an
 * offer number is not a legal/tax document series. Allocated once per
 * revision chain (only when versionNumber is 1); every revision copies the
 * parent's offerNumber rather than drawing a new sequence value - see
 * docs/LEASING-OFFERS.md, "Versioning".
 */
export function formatOfferNumber(seq: number): string {
  return `OFFER-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatOfferNumber() - a reservation number is not a legal/tax document series either. */
export function formatReservationNumber(seq: number): string {
  return `RES-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatReservationNumber() - a Move-In number is not a legal/tax document series either. */
export function formatMoveInNumber(seq: number): string {
  return `MI-${String(seq).padStart(6, "0")}`;
}

/** No year component - a Maintenance Request number is not a legal/tax document series either. */
export function formatMaintenanceRequestNumber(seq: number): string {
  return `MR-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMaintenanceRequestNumber(). */
export function formatMaintenanceWorkOrderNumber(seq: number): string {
  return `WO-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMaintenanceRequestNumber(). */
export function formatMaintenanceVendorNumber(seq: number): string {
  return `VEN-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMoveInNumber() - a Move-Out number is not a legal/tax document series either. */
export function formatMoveOutNumber(seq: number): string {
  return `MO-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMoveOutNumber() - a Security Deposit Settlement number is an internal operational record, not a legal/tax document series (the "Additional Tenant Amount Due" invoice it may reference, if any, gets its own INV- number as usual). */
export function formatSecurityDepositSettlementNumber(seq: number): string {
  return `SDS-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMoveInNumber() - a Corporate Account number is an internal operational record, not a legal/tax document series (the underlying Renter's own invoices keep their usual INV- numbers). */
export function formatCorporateAccountNumber(seq: number): string {
  return `CORP-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMoveInNumber() - a Corporate Housing Allocation number is an internal operational record, not a legal/tax document series. */
export function formatCorporateHousingAllocationNumber(seq: number): string {
  return `CHA-${String(seq).padStart(6, "0")}`;
}

/** No year component, matching formatMoveInNumber() - a Document Management record number is an internal operational reference, not a legal/tax document series. */
export function formatDocumentNumber(seq: number): string {
  return `DOC-${String(seq).padStart(6, "0")}`;
}
