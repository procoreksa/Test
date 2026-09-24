import { prisma } from "@/lib/prisma";
import { summarizeOwnerLedgerEntries } from "@/lib/owner-ledger-rules";

/**
 * Owner Financial Overview (Steps 43-45) - OwnerLedgerEntry is the ONLY
 * source (Critical Principle 2), via summarizeOwnerLedgerEntries()
 * (src/lib/owner-ledger-rules.ts:43), the exact same pure function
 * getOwnerBalance() already uses. NEVER Invoice x ownership%: the Step 1
 * audit confirmed maintenance cost/rent invoicing has zero automatic code
 * paths that post to OwnerLedgerEntry, so multiplying Invoice totals by an
 * ownership percentage here would silently invent a number nothing in this
 * codebase's real accounting workflow produces (the mandatory "Invoice=100k
 * + OwnerLedgerEntry-income=60k -> Executive shows exactly 60k" reconciliation
 * test guards exactly this).
 *
 * This is org-wide (every Owner's entries at once) - a materially different,
 * more sensitive exposure than the single-owner statement `ownerLedger.view`
 * already grants elsewhere in this app, which is why executiveOwnerFinancials.view
 * is its own, more restricted permission (OWNER/ADMIN/ACCOUNTANT only - see
 * src/lib/permissions.ts).
 */
export async function getOwnerFinancialsSummary(organizationId: string, period: { gte: Date; lt: Date }) {
  const entries = await prisma.ownerLedgerEntry.findMany({
    where: { organizationId, entryDate: period },
    select: { debit: true, credit: true, entryType: true },
  });
  return summarizeOwnerLedgerEntries(entries);
}
