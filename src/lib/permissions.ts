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
  | "viewing.cancel";

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
];

// ACCOUNTANT: full financial workflow (invoices, cancellations, payments,
// and now owner ledger entries/reversals), read-only on properties/units/
// renters/contracts/owners/ownership, no org settings.
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
