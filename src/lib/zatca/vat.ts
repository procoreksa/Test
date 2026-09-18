/**
 * VAT arithmetic helpers. Saudi standard VAT rate is 15%. Residential real
 * estate leasing is VAT-exempt (0%) per ZATCA guidance; commercial leasing
 * is taxable at the standard rate. Contracts/units carry their own
 * `vatApplicable` + `vatRate` so this stays configurable per line.
 */

export const STANDARD_VAT_RATE = 15;

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatRate: number;
}

export interface LineComputed extends LineInput {
  taxableAmount: number;
  vatAmount: number;
  lineTotal: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeLine(line: LineInput): LineComputed {
  const gross = line.quantity * line.unitPrice - (line.discount ?? 0);
  const taxableAmount = round2(gross);
  const vatAmount = round2((taxableAmount * line.vatRate) / 100);
  const lineTotal = round2(taxableAmount + vatAmount);
  return { ...line, taxableAmount, vatAmount, lineTotal };
}

export function computeInvoiceTotals(lines: LineInput[]) {
  const computed = lines.map(computeLine);
  const subtotal = round2(computed.reduce((sum, l) => sum + l.taxableAmount, 0));
  const vatAmount = round2(computed.reduce((sum, l) => sum + l.vatAmount, 0));
  const totalAmount = round2(subtotal + vatAmount);
  return { lines: computed, subtotal, vatAmount, totalAmount };
}
