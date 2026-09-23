import { Prisma } from "@prisma/client";
import type { ContractStatus, SettlementStatus, MaintenanceRequestStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tenant Portal - pure domain logic (Step 91). Every rule that decides what
// a tenant sees or may do lives here, exactly once, and is reused by every
// portal query/action rather than being re-derived ad hoc per page. See
// docs/TENANT-PORTAL.md.
// ---------------------------------------------------------------------------

export interface ContractForSelection {
  id: string;
  status: ContractStatus;
  startDate: Date;
  endDate: Date;
}

export interface CurrentTenancySelection<T extends ContractForSelection> {
  current: T | null;
  historical: T[];
}

/**
 * One authoritative definition of "current contract" for the whole portal
 * (Step 16 - "do not invent a second active-contract definition"): the
 * renter's own ACTIVE contract if exactly one exists, else the
 * most-recently-ended contract by endDate. Everything else is historical,
 * newest first. A Renter with zero contracts gets { current: null,
 * historical: [] } - never an error, since that's a normal state before a
 * lease is signed or after every tenancy has ended (Step 10 of the brief).
 */
export function selectCurrentTenancy<T extends ContractForSelection>(contracts: readonly T[]): CurrentTenancySelection<T> {
  const active = contracts.filter((c) => c.status === "ACTIVE");
  const sortedByEndDateDesc = [...contracts].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());

  if (active.length > 0) {
    // Should be exactly one in practice (Contract creation doesn't allow
    // two simultaneous ACTIVE contracts for the same renter/unit), but if
    // more than one somehow exists, the most recently started is current -
    // never silently pick an arbitrary one.
    const current = [...active].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
    return { current, historical: sortedByEndDateDesc.filter((c) => c.id !== current.id) };
  }

  if (sortedByEndDateDesc.length === 0) return { current: null, historical: [] };
  const [mostRecent, ...rest] = sortedByEndDateDesc;
  return { current: mostRecent, historical: rest };
}

// ---------------------------------------------------------------------------
// Settlement visibility policy (Step 45) - one explicit, conservative,
// documented rule. Nothing before APPROVED is ever shown to a tenant; the
// approved commercial snapshot may be shown once frozen even before
// posting (business policy explicitly permits this), and the full final
// view is shown from POSTED onward.
// ---------------------------------------------------------------------------

export type TenantSettlementVisibility = "HIDDEN" | "APPROVED_PENDING_POSTING" | "FINAL";

export function settlementVisibilityForTenant(status: SettlementStatus): TenantSettlementVisibility {
  if (status === "APPROVED") return "APPROVED_PENDING_POSTING";
  if (status === "POSTED" || status === "PARTIALLY_SETTLED" || status === "SETTLED") return "FINAL";
  // DRAFT, UNDER_REVIEW, PENDING_APPROVAL, CANCELLED - never shown.
  return "HIDDEN";
}

// ---------------------------------------------------------------------------
// Maintenance cancellation (Step 37) - only the earliest, pre-triage status
// is tenant-cancellable. Once staff has engaged (triaged, created a Work
// Order, resolved, or already cancelled it), the tenant can no longer
// cancel it themselves.
// ---------------------------------------------------------------------------

export function isTenantCancellableMaintenanceStatus(status: MaintenanceRequestStatus): boolean {
  return status === "OPEN";
}

// ---------------------------------------------------------------------------
// Outstanding balance (Step 26) - one authoritative definition, pure given
// already-fetched invoice totals. Never sums arbitrary client-visible
// figures; never double-counts a settlement's additional-due receivable
// (it's already one of these invoices, since postSecurityDepositSettlement()
// issues it through the same Invoice table - see
// docs/SECURITY-DEPOSIT-SETTLEMENT.md §20).
// ---------------------------------------------------------------------------

export interface InvoiceBalanceInput {
  totalAmount: Prisma.Decimal | number | string;
  paidAmount: Prisma.Decimal | number | string;
  status: string;
}

export function computeTenantOutstandingBalance(invoices: readonly InvoiceBalanceInput[]): Prisma.Decimal {
  return invoices
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum.plus(new Prisma.Decimal(i.totalAmount)).minus(new Prisma.Decimal(i.paidAmount)), new Prisma.Decimal(0));
}
