/**
 * Real, database-backed Tenant/Owner Portal document access tests for
 * Document Management (docs/DOCUMENT-MANAGEMENT.md): the dual-gate
 * (visibility + live entitlement), cross-tenant IDOR (Step 57), ownership
 * override and shared ownership (Step 59-60), immediate effect of a
 * visibility change (Step 74) and an ownership revocation (Step 75),
 * archived documents hidden from portals by default (Step 76), and current-
 * version semantics (Step 77). Mirrors owner-portal-ownership-security.db
 * .test.ts's own conventions for the override/shared-ownership/revocation
 * scenarios, applied to Document Management instead of Unit/Ledger access.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, createTestUnit, type SeededOrg } from "./db-test-helpers";
import { seedTenancy, tenantSessionFor, type SeededTenancy } from "./tenant-portal-test-helpers";
import { seedOwnerPortalOwnership, createTestOwnerPortalAccount, ownerSessionFor } from "./owner-portal-test-helpers";
import { pdfFile, documentFormData, newMockStorageProvider } from "./document-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
const mockTenantAuth = vi.fn();
const mockOwnerAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/tenant-auth", () => ({ auth: () => mockTenantAuth() }));
vi.mock("@/lib/owner-auth", () => ({ auth: () => mockOwnerAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("DOCPORTAL");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockTenantAuth.mockReset();
  mockOwnerAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

async function createDoc(params: {
  title: string;
  category: string;
  entityType: string;
  entityId: string;
  visibility: "INTERNAL_ONLY" | "TENANT_VISIBLE" | "OWNER_VISIBLE";
}) {
  const { createDocumentWithFile } = await import("@/lib/actions/documents");
  const storage = newMockStorageProvider();
  const { documentId } = await createDocumentWithFile(
    documentFormData(
      { title: params.title, category: params.category, securityContextEntityType: params.entityType, securityContextEntityId: params.entityId, visibility: params.visibility },
      pdfFile()
    ),
    { storageProvider: storage }
  );
  return { documentId, storage };
}

describe("Tenant Portal dual-gate and cross-tenant IDOR (Step 55-57)", () => {
  let tenantA: SeededTenancy;
  let tenantB: SeededTenancy;

  beforeAll(async () => {
    tenantA = await seedTenancy(org, "DocTenantA");
    tenantB = await seedTenancy(org, "DocTenantB");
  });

  it("Tenant A cannot access Tenant B's TENANT_VISIBLE document, even in the same organization (neutral not-found)", async () => {
    const { documentId } = await createDoc({
      title: "Tenant B's contract",
      category: "CONTRACT",
      entityType: "CONTRACT",
      entityId: tenantB.contract.id,
      visibility: "TENANT_VISIBLE",
    });

    const { requireTenantDocumentAccess } = await import("@/lib/tenant-session");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantA.account));
    await expect(requireTenantDocumentAccess(documentId)).rejects.toThrow();

    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantB.account));
    const result = await requireTenantDocumentAccess(documentId);
    expect(result.document.id).toBe(documentId);

    const { getTenantDocuments } = await import("@/lib/actions/portal/documents");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantA.account));
    expect((await getTenantDocuments()).some((d) => d.documentId === documentId)).toBe(false);
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantB.account));
    expect((await getTenantDocuments()).some((d) => d.documentId === documentId)).toBe(true);
  });

  it("an INTERNAL_ONLY document is never accessible to its own owning tenant (visibility flag is not optional)", async () => {
    const { documentId } = await createDoc({
      title: "Internal-only for A",
      category: "GENERAL",
      entityType: "CONTRACT",
      entityId: tenantA.contract.id,
      visibility: "INTERNAL_ONLY",
    });

    const { requireTenantDocumentAccess } = await import("@/lib/tenant-session");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantA.account));
    await expect(requireTenantDocumentAccess(documentId)).rejects.toThrow();
  });
});

describe("Owner Portal ownership override (Step 59, critical)", () => {
  it("Owner A owns the Compound; Unit X within it is explicitly, entirely owned by Owner B - Owner A must NOT access an OWNER_VISIBLE document secured to Unit X", async () => {
    const ownerA = await createTestOwner(org.organization.id, "Doc Override Owner A");
    const ownerB = await createTestOwner(org.organization.id, "Doc Override Owner B");
    const accountA = await createTestOwnerPortalAccount(org.organization.id, ownerA.id, org.admin.id);
    const accountB = await createTestOwnerPortalAccount(org.organization.id, ownerB.id, org.admin.id);
    const unitX = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `DocOverride-${Date.now()}` });

    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: ownerA.id, compoundId: org.compound.id, ownershipPercentage: 100 } });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: ownerB.id, unitId: unitX.id, ownershipPercentage: 100 } });

    const { documentId } = await createDoc({ title: "Unit X floor plan", category: "BUILDING_PLAN", entityType: "UNIT", entityId: unitX.id, visibility: "OWNER_VISIBLE" });

    const { requireOwnerDocumentAccess } = await import("@/lib/owner-session");
    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountA));
    await expect(requireOwnerDocumentAccess(documentId)).rejects.toThrow();

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountB));
    const result = await requireOwnerDocumentAccess(documentId);
    expect(result.document.id).toBe(documentId);
  });
});

describe("Owner Portal shared ownership (Step 60)", () => {
  it("Owner A (60%) and Owner B (40%) both access a shared Unit's OWNER_VISIBLE document, but neither gains access to the other's personal Owner-category document", async () => {
    const ownerA = await createTestOwner(org.organization.id, "Doc Shared Owner A");
    const ownerB = await createTestOwner(org.organization.id, "Doc Shared Owner B");
    const accountA = await createTestOwnerPortalAccount(org.organization.id, ownerA.id, org.admin.id);
    const accountB = await createTestOwnerPortalAccount(org.organization.id, ownerB.id, org.admin.id);
    const sharedUnit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `DocShared-${Date.now()}` });

    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: ownerA.id, unitId: sharedUnit.id, ownershipPercentage: 60 } });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: ownerB.id, unitId: sharedUnit.id, ownershipPercentage: 40 } });

    const { documentId: sharedDocId } = await createDoc({
      title: "Shared unit document",
      category: "GENERAL",
      entityType: "UNIT",
      entityId: sharedUnit.id,
      visibility: "OWNER_VISIBLE",
    });
    const { documentId: personalADocId } = await createDoc({
      title: "Owner A's personal ID document",
      category: "IDENTITY",
      entityType: "OWNER",
      entityId: ownerA.id,
      visibility: "OWNER_VISIBLE",
    });

    const { requireOwnerDocumentAccess } = await import("@/lib/owner-session");

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountA));
    expect((await requireOwnerDocumentAccess(sharedDocId)).document.id).toBe(sharedDocId);
    expect((await requireOwnerDocumentAccess(personalADocId)).document.id).toBe(personalADocId);

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountB));
    expect((await requireOwnerDocumentAccess(sharedDocId)).document.id).toBe(sharedDocId);
    await expect(requireOwnerDocumentAccess(personalADocId)).rejects.toThrow(); // never Owner B's, despite sharing an unrelated Unit
  });
});

describe("Visibility change takes effect immediately (Step 74)", () => {
  it("INTERNAL_ONLY -> TENANT_VISIBLE is visible on the very next request, with no session-level caching", async () => {
    const tenancy = await seedTenancy(org, "DocVisTenant");
    const { documentId } = await createDoc({ title: "Later visible", category: "GENERAL", entityType: "CONTRACT", entityId: tenancy.contract.id, visibility: "INTERNAL_ONLY" });

    const { requireTenantDocumentAccess } = await import("@/lib/tenant-session");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenancy.account));
    await expect(requireTenantDocumentAccess(documentId)).rejects.toThrow();

    const { changeDocumentVisibility } = await import("@/lib/actions/documents");
    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("visibility", "TENANT_VISIBLE");
    await changeDocumentVisibility(fd);

    // Same mocked tenant session, no re-login - proving live re-evaluation.
    const result = await requireTenantDocumentAccess(documentId);
    expect(result.document.id).toBe(documentId);
  });
});

describe("Owner access is revoked immediately when ownership ends (Step 75)", () => {
  it("access is granted, then denied immediately after the PropertyOwnership row is ended - the same mocked session is never re-created", async () => {
    const ownership = await seedOwnerPortalOwnership(org, "DocRevoke");
    const { documentId } = await createDoc({ title: "Revocation doc", category: "GENERAL", entityType: "UNIT", entityId: ownership.unit.id, visibility: "OWNER_VISIBLE" });

    const { requireOwnerDocumentAccess } = await import("@/lib/owner-session");
    mockOwnerAuth.mockResolvedValue(ownerSessionFor(ownership.account));
    expect((await requireOwnerDocumentAccess(documentId)).document.id).toBe(documentId);

    await prisma.propertyOwnership.update({ where: { id: ownership.ownership.id }, data: { status: "ENDED" } });

    await expect(requireOwnerDocumentAccess(documentId)).rejects.toThrow();
  });
});

describe("Archived documents are hidden from portals by default (Step 76)", () => {
  it("a TENANT_VISIBLE document becomes inaccessible to the tenant once archived, while internal staff retain access", async () => {
    const tenancy = await seedTenancy(org, "DocArchiveTenant");
    const { documentId } = await createDoc({ title: "Will be archived", category: "GENERAL", entityType: "CONTRACT", entityId: tenancy.contract.id, visibility: "TENANT_VISIBLE" });

    const { requireTenantDocumentAccess } = await import("@/lib/tenant-session");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenancy.account));
    expect((await requireTenantDocumentAccess(documentId)).document.id).toBe(documentId);

    const { archiveDocument, getDocumentDetail } = await import("@/lib/actions/documents");
    const fd = new FormData();
    fd.set("documentId", documentId);
    await archiveDocument(fd);

    await expect(requireTenantDocumentAccess(documentId)).rejects.toThrow();
    const { document } = await getDocumentDetail(documentId); // internal staff still reaches it
    expect(document.id).toBe(documentId);
  });
});

describe("Current version semantics (Step 77)", () => {
  it("a portal always sees the current version by default, and adding a new version immediately changes what it sees", async () => {
    const tenancy = await seedTenancy(org, "DocVersionTenant");
    const { documentId, storage } = await createDoc({
      title: "Versioned tenant doc",
      category: "CONTRACT",
      entityType: "CONTRACT",
      entityId: tenancy.contract.id,
      visibility: "TENANT_VISIBLE",
    });

    const { getTenantDocuments } = await import("@/lib/actions/portal/documents");
    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenancy.account));
    const beforeDto = (await getTenantDocuments()).find((d) => d.documentId === documentId);
    expect(beforeDto?.currentVersion?.fileName).toBe("document.pdf");

    const { addDocumentVersion } = await import("@/lib/actions/documents");
    await addDocumentVersion(documentFormData({ documentId }, pdfFile("updated-lease.pdf")), { storageProvider: storage });

    const afterDto = (await getTenantDocuments()).find((d) => d.documentId === documentId);
    expect(afterDto?.currentVersion?.fileName).toBe("updated-lease.pdf");
  });
});
