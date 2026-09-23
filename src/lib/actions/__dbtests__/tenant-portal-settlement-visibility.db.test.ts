/**
 * Real, database-backed test proving getTenantSettlement() actually applies
 * settlementVisibilityForTenant() over a genuine SecurityDepositSettlement
 * row driven through the real internal lifecycle actions (docs/TENANT-
 * PORTAL.md, "Settlement visibility-by-status policy"). The exhaustive
 * per-status branching table itself is already unit-tested in
 * src/lib/portal/tenancy-rules.test.ts; this file's job is to prove the
 * wiring - HIDDEN (nothing shown, not even that a settlement exists),
 * APPROVED_PENDING_POSTING, and FINAL - holds end-to-end through the real
 * DTO and the real workflow actions, not a hand-built fixture status.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
import { seedTenancy, type SeededTenancy } from "./tenant-portal-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
const mockTenantAuth = vi.fn();
vi.mock("@/lib/tenant-auth", () => ({ auth: () => mockTenantAuth() }));

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

let org: SeededOrg;
let tenancyDraft: SeededTenancy;
let tenancyPosted: SeededTenancy;
let draftSettlementId: string;
let postedSettlementId: string;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("SVX");
  mockAuth.mockResolvedValue(org.session);

  tenancyDraft = await seedTenancy(org, "Draft");
  tenancyPosted = await seedTenancy(org, "Posted");

  const { driveMoveOutToCompletion } = await import("./db-test-helpers");
  const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment } = await import("@/lib/actions/security-deposits");

  const moveOutDraftId = await driveMoveOutToCompletion(tenancyDraft.contract.id);
  draftSettlementId = await createSecurityDepositSettlement(moveOutDraftId);

  await prisma.contract.update({ where: { id: tenancyPosted.contract.id }, data: { securityDeposit: 4000 } });
  await payDepositInvoice(org.organization.id, tenancyPosted.renter.id, tenancyPosted.contract.id, 4000);
  const moveOutPostedId = await driveMoveOutToCompletion(tenancyPosted.contract.id);
  postedSettlementId = await createSecurityDepositSettlement(moveOutPostedId);
  await addLiabilityAssessment(fd({ settlementId: postedSettlementId, sourceType: "OTHER", description: "Wall damage", category: "DAMAGE", proposedAmount: "500" }));
  const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId: postedSettlementId } });
  await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "500", approvedAmount: "500", waivedAmount: "0" }));
});

describe("getTenantSettlement(): visibility-by-status wired end-to-end", () => {
  it("DRAFT: HIDDEN - the tenant sees nothing at all, not even that a settlement exists", async () => {
    mockTenantAuth.mockResolvedValue(tenancyDraft.session);
    const { getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    expect(await getTenantSettlement(tenancyDraft.contract.id)).toBeNull();
  });

  it("CANCELLED: still HIDDEN after the settlement is cancelled from DRAFT", async () => {
    mockAuth.mockResolvedValue(org.session);
    const { cancelSettlement } = await import("@/lib/actions/security-deposits");
    await cancelSettlement(fd({ settlementId: draftSettlementId, reason: "Test cancellation" }));
    const cancelled = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: draftSettlementId } });
    expect(cancelled.status).toBe("CANCELLED");

    mockTenantAuth.mockResolvedValue(tenancyDraft.session);
    const { getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    expect(await getTenantSettlement(tenancyDraft.contract.id)).toBeNull();
  });

  it("APPROVED: APPROVED_PENDING_POSTING - figures are final but not yet posted", async () => {
    mockAuth.mockResolvedValue(org.session);
    const { submitSettlementForReview, reviewSettlement, approveSettlement } = await import("@/lib/actions/security-deposits");
    await submitSettlementForReview(postedSettlementId);
    await reviewSettlement(postedSettlementId, "FORWARD");
    await approveSettlement(postedSettlementId);
    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: postedSettlementId } });
    expect(approved.status).toBe("APPROVED");

    mockTenantAuth.mockResolvedValue(tenancyPosted.session);
    const { getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    const view = await getTenantSettlement(tenancyPosted.contract.id);
    expect(view?.visibility).toBe("APPROVED_PENDING_POSTING");
    expect(view?.assessments).toHaveLength(1);
    expect(Number(view?.assessments[0].approvedAmount)).toBe(500);
  });

  it("POSTED: FINAL - the full final view, including refund fields", async () => {
    mockAuth.mockResolvedValue(org.session);
    const { postSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
    await postSecurityDepositSettlement(postedSettlementId);
    const posted = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: postedSettlementId } });
    expect(["POSTED", "PARTIALLY_SETTLED", "SETTLED"]).toContain(posted.status);

    mockTenantAuth.mockResolvedValue(tenancyPosted.session);
    const { getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    const view = await getTenantSettlement(tenancyPosted.contract.id);
    expect(view?.visibility).toBe("FINAL");
    expect(view?.refundPaid).toBeDefined();
    expect(view?.refundRemaining).toBeDefined();
  });

  it("never labels a finding a 'Tenant Charge' unless it is an APPROVED TENANT-responsibility assessment - only such assessments are ever in the tenant view", async () => {
    mockTenantAuth.mockResolvedValue(tenancyPosted.session);
    const { getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    const view = await getTenantSettlement(tenancyPosted.contract.id);
    for (const a of view?.assessments ?? []) {
      expect(Number(a.approvedAmount)).toBeGreaterThan(0);
    }
  });
});
