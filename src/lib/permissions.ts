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
  | "reservation.amount.update"
  | "reservation.convert"
  | "moveIn.view"
  | "moveIn.create"
  | "moveIn.update"
  | "moveIn.start"
  | "moveIn.complete"
  | "moveIn.cancel"
  | "moveInInspection.update"
  | "maintenance.view"
  | "maintenance.request.create"
  | "maintenance.request.update"
  | "maintenance.request.triage"
  | "maintenance.request.cancel"
  | "maintenance.workOrder.create"
  | "maintenance.workOrder.assign"
  | "maintenance.workOrder.update"
  | "maintenance.workOrder.start"
  | "maintenance.workOrder.complete"
  | "maintenance.workOrder.verify"
  | "maintenance.workOrder.close"
  | "maintenance.workOrder.cancel"
  | "maintenance.cost.view"
  | "maintenance.cost.manage"
  | "maintenance.vendor.view"
  | "maintenance.vendor.manage"
  | "moveOut.view"
  | "moveOut.create"
  | "moveOut.update"
  | "moveOut.start"
  | "moveOut.complete"
  | "moveOut.cancel"
  | "moveOutInspection.update"
  | "securityDeposit.view"
  | "securityDeposit.create"
  | "securityDeposit.assess"
  | "securityDeposit.review"
  | "securityDeposit.approve"
  | "securityDeposit.post"
  | "securityDeposit.refund.view"
  | "securityDeposit.refund.manage"
  | "securityDeposit.dispute.manage"
  | "tenantPortalAccount.view"
  | "tenantPortalAccount.create"
  | "tenantPortalAccount.activate"
  | "tenantPortalAccount.suspend"
  | "tenantPortalAccount.disable"
  | "tenantPortalAccount.resetPassword"
  | "ownerPortalAccount.view"
  | "ownerPortalAccount.create"
  | "ownerPortalAccount.activate"
  | "ownerPortalAccount.suspend"
  | "ownerPortalAccount.disable"
  | "ownerPortalAccount.resetPassword"
  | "corporateHousing.view"
  | "corporateAccount.create"
  | "corporateAccount.update"
  | "corporateContact.manage"
  | "corporateOccupant.create"
  | "corporateOccupant.update"
  | "corporateAllocation.create"
  | "corporateAllocation.update"
  | "corporateAllocation.activate"
  | "corporateAllocation.end"
  | "corporateAllocation.cancel"
  | "corporateAllocation.transfer"
  | "corporateHousingReports.view"
  | "communications.view"
  | "communications.message.view"
  | "communications.retry"
  | "communications.cancel"
  | "communicationTemplate.view"
  | "communicationTemplate.create"
  | "communicationTemplate.version"
  | "communicationTemplate.activate"
  | "communicationRule.view"
  | "communicationRule.create"
  | "communicationRule.update"
  | "communicationTest.send"
  | "document.view"
  | "document.create"
  | "document.version.create"
  | "document.archive"
  | "document.restore"
  | "document.download"
  | "document.visibility.manage"
  | "document.link.manage"
  | "executiveDashboard.view"
  | "executiveFinancials.view"
  | "executiveOperations.view"
  | "executiveMaintenance.view"
  | "executiveOwnerFinancials.view"
  | "executiveCorporateHousing.view"
  | "automation.view"
  | "automation.settings.view"
  | "automation.settings.update"
  | "automation.job.view"
  | "automation.job.retry"
  | "automation.job.cancel"
  | "automation.outbox.view"
  | "automation.outbox.retry";

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
  "reservation.convert",
  "moveIn.view",
  "moveIn.create",
  "moveIn.update",
  "moveIn.start",
  "moveIn.complete",
  "moveIn.cancel",
  "moveInInspection.update",
  "maintenance.view",
  "maintenance.request.create",
  "maintenance.request.update",
  "maintenance.request.triage",
  "maintenance.request.cancel",
  "maintenance.workOrder.create",
  "maintenance.workOrder.assign",
  "maintenance.workOrder.update",
  "maintenance.workOrder.start",
  "maintenance.workOrder.complete",
  "maintenance.workOrder.verify",
  "maintenance.workOrder.close",
  "maintenance.workOrder.cancel",
  "maintenance.cost.view",
  "maintenance.cost.manage",
  "maintenance.vendor.view",
  "maintenance.vendor.manage",
  "moveOut.view",
  "moveOut.create",
  "moveOut.update",
  "moveOut.start",
  "moveOut.complete",
  "moveOut.cancel",
  "moveOutInspection.update",
  "securityDeposit.view",
  "securityDeposit.create",
  "securityDeposit.assess",
  "securityDeposit.review",
  "securityDeposit.approve",
  "securityDeposit.post",
  "securityDeposit.refund.view",
  "securityDeposit.refund.manage",
  "securityDeposit.dispute.manage",
  "tenantPortalAccount.view",
  "tenantPortalAccount.create",
  "tenantPortalAccount.activate",
  "tenantPortalAccount.suspend",
  "tenantPortalAccount.disable",
  "tenantPortalAccount.resetPassword",
  "ownerPortalAccount.view",
  "ownerPortalAccount.create",
  "ownerPortalAccount.activate",
  "ownerPortalAccount.suspend",
  "ownerPortalAccount.disable",
  "ownerPortalAccount.resetPassword",
  "corporateHousing.view",
  "corporateAccount.create",
  "corporateAccount.update",
  "corporateContact.manage",
  "corporateOccupant.create",
  "corporateOccupant.update",
  "corporateAllocation.create",
  "corporateAllocation.update",
  "corporateAllocation.activate",
  "corporateAllocation.end",
  "corporateAllocation.cancel",
  "corporateAllocation.transfer",
  "corporateHousingReports.view",
  "communications.view",
  "communications.message.view",
  "communications.retry",
  "communications.cancel",
  "communicationTemplate.view",
  "communicationTemplate.create",
  "communicationTemplate.version",
  "communicationTemplate.activate",
  "communicationRule.view",
  "communicationRule.create",
  "communicationRule.update",
  "communicationTest.send",
  "document.view",
  "document.create",
  "document.version.create",
  "document.archive",
  "document.restore",
  "document.download",
  "document.visibility.manage",
  "document.link.manage",
  "executiveDashboard.view",
  "executiveFinancials.view",
  "executiveOperations.view",
  "executiveMaintenance.view",
  "executiveOwnerFinancials.view",
  "executiveCorporateHousing.view",
  "automation.view",
  "automation.settings.view",
  "automation.settings.update",
  "automation.job.view",
  "automation.job.retry",
  "automation.job.cancel",
  "automation.outbox.view",
  "automation.outbox.retry",
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
  // the brief: "MANAGER: all operational permissions"), including
  // reservation.convert - OWNER/ADMIN/MANAGER only per docs/
  // RESERVATION-TO-CONTRACT.md Step 28 (ACCOUNTANT/VIEWER excluded, same
  // as every other reservation mutation).
  "reservation.view",
  "reservation.create",
  "reservation.update",
  "reservation.confirm",
  "reservation.cancel",
  "reservation.release",
  "reservation.amount.update",
  "reservation.convert",
  // MANAGER holds every moveIn.*/moveInInspection.* permission (Step 44 of
  // docs/MOVE-IN-HANDOVER.md: "MANAGER: all") - Move-In/handover is
  // day-to-day leasing-operations work, the same tier as Contract
  // create/update/renew/terminate above.
  "moveIn.view",
  "moveIn.create",
  "moveIn.update",
  "moveIn.start",
  "moveIn.complete",
  "moveIn.cancel",
  "moveInInspection.update",
  // MANAGER holds every maintenance.* operational permission (Step 75:
  // "MANAGER: all operational maintenance permissions") - excludes nothing,
  // same tier as Move-In/Contract above. No new role was introduced for
  // Maintenance; MANAGER is the day-to-day operational role throughout
  // this codebase.
  "maintenance.view",
  "maintenance.request.create",
  "maintenance.request.update",
  "maintenance.request.triage",
  "maintenance.request.cancel",
  "maintenance.workOrder.create",
  "maintenance.workOrder.assign",
  "maintenance.workOrder.update",
  "maintenance.workOrder.start",
  "maintenance.workOrder.complete",
  "maintenance.workOrder.verify",
  "maintenance.workOrder.close",
  "maintenance.workOrder.cancel",
  "maintenance.cost.view",
  "maintenance.cost.manage",
  "maintenance.vendor.view",
  "maintenance.vendor.manage",
  // MANAGER holds every moveOut.*/moveOutInspection.* permission (Move-Out
  // Management Phase 2, requirement 6: "MANAGER: all Move-Out operational
  // permissions") - same operational tier as Move-In/Maintenance above.
  "moveOut.view",
  "moveOut.create",
  "moveOut.update",
  "moveOut.start",
  "moveOut.complete",
  "moveOut.cancel",
  "moveOutInspection.update",
  // Security Deposit Settlement: MANAGER prepares/assesses/reviews/manages
  // disputes (the operational side), but never approves, posts, or manages
  // refunds - that segregation of duties (Step 34-36) is deliberate: a
  // MANAGER can build a settlement end to end except the two genuinely
  // financial actions, which are OWNER-only (approve) or ACCOUNTANT-only
  // (post/refund).
  "securityDeposit.view",
  "securityDeposit.create",
  "securityDeposit.assess",
  "securityDeposit.review",
  "securityDeposit.dispute.manage",
  // Tenant Portal account administration (docs/TENANT-PORTAL.md, "Internal
  // account administration"): MANAGER can create/activate/suspend an
  // account (the day-to-day leasing-operations tier), but disabling an
  // account permanently and resetting a tenant's credential are reserved
  // for OWNER/ADMIN - the same higher-trust tier that already gates
  // settings.update.
  "tenantPortalAccount.view",
  "tenantPortalAccount.create",
  "tenantPortalAccount.activate",
  "tenantPortalAccount.suspend",
  // Owner Portal account administration (docs/OWNER-PORTAL.md, "Internal
  // account administration"): same higher-trust split as Tenant Portal
  // above - MANAGER can create/activate/suspend, but disabling an account
  // permanently and resetting an owner's credential stay OWNER/ADMIN-only.
  "ownerPortalAccount.view",
  "ownerPortalAccount.create",
  "ownerPortalAccount.activate",
  "ownerPortalAccount.suspend",
  // Corporate Housing (docs/CORPORATE-HOUSING.md): MANAGER holds every
  // operational permission - account/contact/occupant/allocation
  // management, including transfer/end/cancel - the same "MANAGER: all
  // operational" tier already applied to Maintenance/Move-In/Move-Out
  // elsewhere in this table. Nothing here is reserved as OWNER/ADMIN-only:
  // unlike tenantPortalAccount/ownerPortalAccount, no action in this
  // module is a credential-issuing or permanently-destructive operation.
  "corporateHousing.view",
  "corporateAccount.create",
  "corporateAccount.update",
  "corporateContact.manage",
  "corporateOccupant.create",
  "corporateOccupant.update",
  "corporateAllocation.create",
  "corporateAllocation.update",
  "corporateAllocation.activate",
  "corporateAllocation.end",
  "corporateAllocation.cancel",
  "corporateAllocation.transfer",
  "corporateHousingReports.view",
  // Notifications & Communications: MANAGER gets the day-to-day operational
  // surface (dashboard, message list/detail, manual retry/cancel, and
  // read-only visibility into templates/rules so they can see what will
  // fire) but never template/rule authoring - creating or activating a
  // template/rule is a configuration change in the same higher-trust tier
  // as settings.update, reserved for OWNER/ADMIN. No communicationTest.send
  // either - that stays OWNER/ADMIN-only per docs/NOTIFICATIONS-COMMUNICATIONS.md.
  "communications.view",
  "communications.message.view",
  "communications.retry",
  "communications.cancel",
  "communicationTemplate.view",
  "communicationRule.view",
  // Document Management (docs/DOCUMENT-MANAGEMENT.md): MANAGER gets the
  // day-to-day operational surface - view/create/upload a new version/
  // download/link a document to another entity - but never archive/
  // restore or manage visibility, which are higher-trust actions in the
  // same tier as settings.update, reserved for OWNER/ADMIN.
  "document.view",
  "document.create",
  "document.version.create",
  "document.download",
  "document.link.manage",
  // Executive Dashboards (docs/EXECUTIVE-DASHBOARDS.md): MANAGER gets every
  // aggregate management-intelligence view built on data it already sees
  // operationally elsewhere in this table (occupancy, leasing funnel,
  // collections, move-in/move-out/maintenance, corporate housing) - but NOT
  // executiveOwnerFinancials.view. The org-wide Owner Financial Overview
  // aggregates every owner's OwnerLedgerEntry at once, which is a more
  // sensitive exposure than the single-owner ledger.view MANAGER already
  // holds, so it stays OWNER/ADMIN/ACCOUNTANT-only - a deliberate,
  // documented field-level restriction, not an oversight.
  "executiveDashboard.view",
  "executiveFinancials.view",
  "executiveOperations.view",
  "executiveMaintenance.view",
  "executiveCorporateHousing.view",
  // Automation & Scheduled Jobs (docs/AUTOMATION-SCHEDULED-JOBS.md): MANAGER
  // gets the full operational surface - view dashboards/jobs/outbox and
  // retry/cancel operational jobs - but never automation.settings.update,
  // which is an organization-level configuration change reserved for
  // OWNER/ADMIN, the same tier as every other *.settings.update in this
  // table.
  "automation.view",
  "automation.settings.view",
  "automation.job.view",
  "automation.job.retry",
  "automation.job.cancel",
  "automation.outbox.view",
  "automation.outbox.retry",
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
  // Step 44: "ACCOUNTANT: moveIn.view only if operational visibility is
  // useful" - granted, matching ACCOUNTANT's own broad *.view visibility
  // into the Contract lifecycle elsewhere in this table (contract.view,
  // ownerLedger.view, etc.); no moveIn.* mutation permission at all.
  "moveIn.view",
  // Step 75: "ACCOUNTANT: maintenance.view + maintenance.cost.view +
  // maintenance.vendor.view but NOT operational mutation by default" -
  // ACCOUNTANT can see what maintenance cost, but never triage/assign/
  // start/complete a Work Order (that stays MANAGER/ADMIN/OWNER-only).
  "maintenance.view",
  "maintenance.cost.view",
  "maintenance.vendor.view",
  // Requirement 6: "ACCOUNTANT: moveOut.view" - visibility only, same as
  // ACCOUNTANT's own moveIn.view-only policy above; no moveOut.* mutation.
  "moveOut.view",
  // Security Deposit Settlement: ACCOUNTANT reviews, posts, and manages
  // refunds - the genuinely financial half of the workflow (Step 34-36) -
  // but never assesses liability or approves (that stays MANAGER's
  // assessment role and OWNER/ADMIN's approval role respectively).
  "securityDeposit.view",
  "securityDeposit.review",
  "securityDeposit.post",
  "securityDeposit.refund.view",
  "securityDeposit.refund.manage",
  "tenantPortalAccount.view",
  "ownerPortalAccount.view",
  // Corporate Housing: ACCOUNTANT gets view + reports (Financial Snapshot
  // report uses the existing Contract/Invoice/Payment engine ACCOUNTANT
  // already has full visibility into elsewhere) but no mutation - the same
  // read-only-on-operational-modules posture ACCOUNTANT already holds for
  // CRM/Viewings/Offers.
  "corporateHousing.view",
  "corporateHousingReports.view",
  // Notifications & Communications: ACCOUNTANT gets read-only visibility
  // into the message log (e.g. confirming an INVOICE_ISSUED/PAYMENT_RECEIVED
  // notification actually went out) - the same *.view-only posture already
  // applied to moveIn.view/moveOut.view above. No retry/cancel, no
  // template/rule access.
  "communications.view",
  "communications.message.view",
  // Document Management: ACCOUNTANT can view/download and upload
  // finance-shaped documents (e.g. a PAYMENT_RECEIPT evidence scan
  // attached to an Invoice/Payment/Contract) since ACCOUNTANT already
  // creates Invoices/Payments elsewhere in this table - but never
  // archive/restore/manage visibility/manage links, which stay
  // MANAGER-or-above.
  "document.view",
  "document.create",
  "document.download",
  // Executive Dashboards: ACCOUNTANT is the one non-OWNER/ADMIN role that
  // already holds full owner-ledger authority (ownerLedger.view/create/
  // reverse above), so it is the only other role trusted with the org-wide
  // Owner Financial Overview - every other executive view too, matching
  // ACCOUNTANT's already-broad *.view-everywhere financial posture.
  "executiveDashboard.view",
  "executiveFinancials.view",
  "executiveOperations.view",
  "executiveMaintenance.view",
  "executiveOwnerFinancials.view",
  "executiveCorporateHousing.view",
  // Automation & Scheduled Jobs: ACCOUNTANT gets read-only visibility into
  // jobs/outbox/settings (e.g. confirming a RENT_DUE_REMINDER actually ran)
  // - the same *.view-only posture already applied to Communications above -
  // but no retry/cancel and no settings mutation.
  "automation.view",
  "automation.settings.view",
  "automation.job.view",
  "automation.outbox.view",
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
  "moveIn.view",
  "maintenance.view",
  "moveOut.view",
  "securityDeposit.view",
  "securityDeposit.refund.view",
  "tenantPortalAccount.view",
  "ownerPortalAccount.view",
  "corporateHousing.view",
  "communications.view",
  "communications.message.view",
  // Document Management: VIEWER can view/download, same read-only posture
  // as every other module in this table - never create/version/archive/
  // restore/manage.
  "document.view",
  "document.download",
  // Executive Dashboards: VIEWER gets read-only access to every executive
  // view except executiveOwnerFinancials.view (same OWNER/ADMIN/ACCOUNTANT-
  // only restriction as MANAGER above) - and even within
  // executiveMaintenance.view, the maintenance-cost figures are further
  // redacted server-side because VIEWER lacks maintenance.cost.view (see
  // src/lib/executive/maintenance.ts) - a genuine field-level, not just
  // page-level, RBAC boundary.
  "executiveDashboard.view",
  "executiveFinancials.view",
  "executiveOperations.view",
  "executiveMaintenance.view",
  "executiveCorporateHousing.view",
  // Automation & Scheduled Jobs: VIEWER gets read-only visibility into jobs
  // and outbox (same read-only-everywhere posture as the rest of this
  // table) but not automation.settings.view - VIEWER has no visibility into
  // organization Settings anywhere else in this table either.
  "automation.view",
  "automation.job.view",
  "automation.outbox.view",
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
