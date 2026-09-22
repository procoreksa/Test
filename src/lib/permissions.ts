import type { UserRole } from "@prisma/client";

/**
 * Centralized RBAC permission keys. Every server action that mutates data,
 * and every read of sensitive business data, is gated by one of these -
 * never by a scattered `if (role === "...")` check. See docs/PERMISSIONS.md
 * for the full policy and how to protect a new action.
 */
export type Permission =
  | "dashboard.view"
  | "property.view"
  | "property.create"
  | "property.update"
  | "property.delete"
  | "unit.view"
  | "unit.create"
  | "unit.update"
  | "unit.delete"
  | "renter.view"
  | "renter.create"
  | "renter.update"
  | "renter.delete"
  | "contract.view"
  | "contract.create"
  | "contract.update"
  | "contract.renew"
  | "contract.terminate"
  | "invoice.view"
  | "invoice.create"
  | "invoice.cancel"
  | "payment.view"
  | "payment.create"
  | "report.view"
  | "settings.view"
  | "settings.update"
  | "owner.view"
  | "owner.create"
  | "owner.update"
  | "ownership.view"
  | "ownership.manage"
  | "ownerLedger.view"
  | "ownerLedger.create"
  | "ownerLedger.reverse"
  | "audit.view"
  | "audit.export"
  | "lead.view"
  | "lead.create"
  | "lead.update"
  | "lead.assign"
  | "lead.convert"
  | "lead.archive"
  | "leadActivity.view"
  | "leadActivity.create"
  | "viewing.view"
  | "viewing.create"
  | "viewing.update"
  | "viewing.assign"
  | "viewing.complete"
  | "viewing.cancel"
  | "offer.view"
  | "offer.create"
  | "offer.update"
  | "offer.submit"
  | "offer.approve"
  | "offer.send"
  | "offer.revise"
  | "offer.accept"
  | "offer.reject"
  | "offer.cancel"
  | "reservation.view"
  | "reservation.create"
  | "reservation.update"
  | "reservation.confirm"
  | "reservation.cancel"
  | "reservation.release"
  | "reservation.amount.update";

const ALL_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "property.view",
  "property.create",
  "property.update",
  "property.delete",
  "unit.view",
  "unit.create",
  "unit.update",
  "unit.delete",
  "renter.view",
  "renter.create",
  "renter.update",
  "renter.delete",
  "contract.view",
  "contract.create",
  "contract.update",
  "contract.renew",
  "contract.terminate",
  "invoice.view",
  "invoice.create",
  "invoice.cancel",
  "payment.view",
  "payment.create",
  "report.view",
  "settings.view",
  "settings.update",
  "owner.view",
  "owner.create",
  "owner.update",
  "ownership.view",
  "ownership.manage",
  "ownerLedger.view",
  "ownerLedger.create",
  "ownerLedger.reverse",
  "audit.view",
  "audit.export",
  "lead.view",
  "lead.create",
  "lead.update",
  "lead.assign",
  "lead.convert",
  "lead.archive",
  "leadActivity.view",
  "leadActivity.create",
  "viewing.view",
  "viewing.create",
  "viewing.update",
  "viewing.assign",
  "viewing.complete",
  "viewing.cancel",
  "offer.view",
  "offer.create",
  "offer.update",
  "offer.submit",
  "offer.approve",
  "offer.send",
  "offer.revise",
  "offer.accept",
  "offer.reject",
  "offer.cancel",
  "reservation.view",
  "reservation.create",
  "reservation.update",
  "reservation.confirm",
  "reservation.cancel",
  "reservation.release",
  "reservation.amount.update",
];

// MANAGER: full operational access, but never organization-level configuration
// (that stays OWNER/ADMIN-only, per the "explicitly permitted" policy).
const MANAGER_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "property.view",
  "property.create",
  "property.update",
  "unit.view",
  "unit.create",
  "unit.update",
  "renter.view",
  "renter.create",
  "renter.update",
  "contract.view",
  "contract.create",
  "contract.update",
  "contract.renew",
  "contract.terminate",
  "invoice.view",
  "invoice.create",
  "payment.view",
  "payment.create",
  "report.view",
  "owner.view",
  "owner.create",
  "owner.update",
  "ownership.view",
  "ownership.manage",
  "ownerLedger.view",
  "audit.view",
  "lead.view",
  "lead.create",
  "lead.update",
  "lead.assign",
  "lead.convert",
  "lead.archive",
  "leadActivity.view",
  "leadActivity.create",
  "viewing.view",
  "viewing.create",
  "viewing.update",
  "viewing.assign",
  "viewing.complete",
  "viewing.cancel",
  // MANAGER holds every offer.* permission including offer.approve - the
  // >10% discount restriction ("MANAGER cannot self-approve") is a business
  // rule enforced inside approveOffer() via canApproveDiscount(), not a
  // permission gate, so a future centralized approval engine can generalize
  // it without an RBAC change. See docs/LEASING-OFFERS.md, "Approval rules".
  "offer.view",
  "offer.create",
  "offer.update",
  "offer.submit",
  "offer.approve",
  "offer.send",
  "offer.revise",
  "offer.accept",
  "offer.reject",
  "offer.cancel",
  // MANAGER holds every reservation.* operational permission (Step 29 of
  // the brief: "MANAGER: all operational permissions").
  "reservation.view",
  "reservation.create",
  "reservation.update",
  "reservation.confirm",
  "reservation.cancel",
  "reservation.release",
  "reservation.amount.update",
];

// ACCOUNTANT: full financial workflow (invoices, cancellations, payments,
// and now owner ledger entries/reversals), read-only on properties/units/
// renters/contracts/owners/ownership, no org settings. No offer.* at all -
// deliberately mirrors ACCOUNTANT already having no lead.*/viewing.*
// permissions either: Offers are pre-contract commercial/negotiation data,
// and ACCOUNTANT's visibility begins at Contract/Invoice stage, same as for
// Leads/Viewings. See docs/PERMISSIONS.md.
const ACCOUNTANT_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "property.view",
  "unit.view",
  "renter.view",
  "contract.view",
  "invoice.view",
  "invoice.create",
  "invoice.cancel",
  "payment.view",
  "payment.create",
  "report.view",
  "owner.view",
  "ownership.view",
  "ownerLedger.view",
  "ownerLedger.create",
  "ownerLedger.reverse",
  "audit.view",
  // Deliberately different from ACCOUNTANT's lead.*/viewing.*/offer.* policy
  // (all none): reservation amount status IS relevant to ACCOUNTANT even
  // though it is not itself an accounting entry, since it foreshadows the
  // money a future Contract will actually invoice. Per the brief's own
  // explicit Step 29 instruction. See docs/RESERVATION-MANAGEMENT.md.
  "reservation.view",
  "reservation.amount.update",
];

// VIEWER: read-only everywhere, no mutations of any kind.
const VIEWER_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "property.view",
  "unit.view",
  "renter.view",
  "contract.view",
  "invoice.view",
  "payment.view",
  "report.view",
  "owner.view",
  "ownership.view",
  "ownerLedger.view",
  "lead.view",
  "viewing.view",
  "offer.view",
  "reservation.view",
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  ACCOUNTANT: ACCOUNTANT_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

/** Pure permission check - no session/network access, safe to unit test directly. */
export function can(permission: Permission, role: UserRole): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
