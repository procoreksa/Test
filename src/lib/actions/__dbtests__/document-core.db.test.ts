/**
 * Real, database-backed core behavior tests for Document Management
 * (docs/DOCUMENT-MANAGEMENT.md): create/version/archive/restore/visibility/
 * links, financial isolation (Step 91), Move-In immutability (Step 92-94),
 * and cross-org/IDOR on reads (Step 69-71). Only the internal NextAuth
 * session boundary is mocked - everything else runs through the real
 * server actions and a real Postgres database, the same pattern
 * established by communications-cross-org-security.db.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, seedFinancialsForOrg, createTestContract, driveMoveInToCompletion, type SeededOrg } from "./db-test-helpers";
import { pdfFile, documentFormData, newMockStorageProvider } from "./document-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("DOCA");
  orgB = await seedFullOrg("DOCB");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(orgA.session);
});

describe("createDocumentWithFile", () => {
  it("creates a Document + version 1, sets currentVersionId, and records a CREATE audit row", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();

    const { documentId } = await createDocumentWithFile(
      documentFormData(
        { title: "Lease Contract", category: "CONTRACT", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id, visibility: "INTERNAL_ONLY" },
        pdfFile()
      ),
      { storageProvider: storage }
    );

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { currentVersion: true, versions: true } });
    expect(document.documentNumber).toMatch(/^DOC-\d{6}$/);
    expect(document.status).toBe("ACTIVE");
    expect(document.versions).toHaveLength(1);
    expect(document.currentVersion?.versionNumber).toBe(1);
    expect(document.currentVersion?.fileName).toBe("document.pdf");
    expect(document.currentVersion?.storageKey).not.toContain("document.pdf"); // key is opaque, never the filename
    expect(storage.debugObjectCount()).toBe(1);

    const audit = await prisma.auditLog.findFirst({ where: { organizationId: orgA.organization.id, entityType: "Document", entityId: documentId, action: "CREATE" } });
    expect(audit).not.toBeNull();
  });

  it("rejects an entity id that does not exist in this organization - creates nothing, writes nothing to storage", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const storage = newMockStorageProvider();
    const countBefore = await prisma.document.count({ where: { organizationId: orgA.organization.id } });

    await expect(
      createDocumentWithFile(
        documentFormData({ title: "Ghost", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: "nonexistent-contract-id" }, pdfFile()),
        { storageProvider: storage }
      )
    ).rejects.toThrow();

    expect(await prisma.document.count({ where: { organizationId: orgA.organization.id } })).toBe(countBefore);
    expect(storage.debugObjectCount()).toBe(0);
  });

  it("rejects a cross-org entity reference (Org B's Contract while authenticated as Org A) - the entity registry never matches across organizations", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract: contractB } = await createTestContract(orgB);
    const storage = newMockStorageProvider();

    await expect(
      createDocumentWithFile(
        documentFormData({ title: "Cross-org attempt", category: "CONTRACT", securityContextEntityType: "CONTRACT", securityContextEntityId: contractB.id }, pdfFile()),
        { storageProvider: storage }
      )
    ).rejects.toThrow();
    expect(storage.debugObjectCount()).toBe(0);
  });

  it("accepts a same-organization Contract id with incidental leading/trailing whitespace, and persists the normalized (trimmed) id, not the padded raw value", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const paddedId = `  ${contract.id}\n`;

    const { documentId } = await createDocumentWithFile(
      documentFormData(
        { title: "Whitespace-padded id", category: "CONTRACT", securityContextEntityType: "CONTRACT", securityContextEntityId: paddedId },
        pdfFile()
      ),
      { storageProvider: storage }
    );

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.securityContextEntityId).toBe(contract.id); // normalized, never the padded raw value
    expect(document.securityContextEntityId).not.toBe(paddedId);
    expect(storage.debugObjectCount()).toBe(1);
  });

  it("rejects an invalid file (bad signature) - creates nothing, writes nothing to storage", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const fakeFile = new File([Buffer.from("<html>not a pdf</html>")], "fake.pdf", { type: "application/pdf" });

    await expect(
      createDocumentWithFile(
        documentFormData({ title: "Bad file", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, fakeFile),
        { storageProvider: storage }
      )
    ).rejects.toThrow();
    expect(storage.debugObjectCount()).toBe(0);
  });
});

describe("addDocumentVersion", () => {
  it("increments versionNumber, repoints currentVersionId, and keeps the prior version's row intact (immutable history)", async () => {
    const { createDocumentWithFile, addDocumentVersion } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();

    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Versioned doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile("v1.pdf")),
      { storageProvider: storage }
    );
    const docAfterV1 = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const v1Id = docAfterV1.currentVersionId;

    const { versionId: v2Id } = await addDocumentVersion(documentFormData({ documentId }, pdfFile("v2.pdf")), { storageProvider: storage });

    const docAfterV2 = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(docAfterV2.currentVersionId).toBe(v2Id);
    expect(docAfterV2.versions).toHaveLength(2);
    const v1Row = docAfterV2.versions.find((v) => v.id === v1Id);
    expect(v1Row).toBeDefined();
    expect(v1Row?.fileName).toBe("v1.pdf"); // untouched by the new version
    expect(docAfterV2.versions.find((v) => v.id === v2Id)?.versionNumber).toBe(2);
  });
});

describe("Archive / Restore", () => {
  it("archives then restores, recording ARCHIVE/RESTORE audit rows, and hides an archived document from the default list", async () => {
    const { createDocumentWithFile, archiveDocument, restoreDocument, listDocuments } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Archive me", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    const fd1 = new FormData();
    fd1.set("documentId", documentId);
    await archiveDocument(fd1);
    let doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("ARCHIVED");
    expect(doc.archivedAt).not.toBeNull();

    const { rows } = await listDocuments({ status: "ACTIVE" });
    expect(rows.some((r) => r.id === documentId)).toBe(false);

    const fd2 = new FormData();
    fd2.set("documentId", documentId);
    await restoreDocument(fd2);
    doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.status).toBe("ACTIVE");
    expect(doc.restoredAt).not.toBeNull();

    const archiveAudit = await prisma.auditLog.findFirst({ where: { entityType: "Document", entityId: documentId, action: "ARCHIVE" } });
    const restoreAudit = await prisma.auditLog.findFirst({ where: { entityType: "Document", entityId: documentId, action: "RESTORE" } });
    expect(archiveAudit).not.toBeNull();
    expect(restoreAudit).not.toBeNull();
  });
});

describe("changeDocumentVisibility", () => {
  it("changes visibility immediately, visible on the very next read, with an UPDATE audit row", async () => {
    const { createDocumentWithFile, changeDocumentVisibility } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Visibility doc", category: "CONTRACT", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id, visibility: "INTERNAL_ONLY" }, pdfFile()),
      { storageProvider: storage }
    );

    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("visibility", "TENANT_VISIBLE");
    await changeDocumentVisibility(fd);

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.visibility).toBe("TENANT_VISIBLE");

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Document", entityId: documentId, action: "UPDATE" } });
    expect(audit).not.toBeNull();
  });
});

describe("Document links (Step 72)", () => {
  it("adds a secondary link and silently no-ops a duplicate identical link", async () => {
    const { createDocumentWithFile, addDocumentLink } = await import("@/lib/actions/documents");
    const { contract, unit } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Linked doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    const fd1 = new FormData();
    fd1.set("documentId", documentId);
    fd1.set("entityType", "UNIT");
    fd1.set("entityId", unit.id);
    await addDocumentLink(fd1);
    await addDocumentLink(fd1); // duplicate - must not throw or create a second row

    const links = await prisma.documentLink.findMany({ where: { documentId } });
    expect(links).toHaveLength(1);
  });

  it("normalizes a whitespace-padded entityId before the existence check and persists the trimmed value on DocumentLink", async () => {
    const { createDocumentWithFile, addDocumentLink } = await import("@/lib/actions/documents");
    const { contract, unit } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Linked doc (padded)", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("entityType", "UNIT");
    fd.set("entityId", `\t${unit.id}  `);
    await addDocumentLink(fd);

    const link = await prisma.documentLink.findFirstOrThrow({ where: { documentId, entityType: "UNIT" } });
    expect(link.entityId).toBe(unit.id);
  });
});

describe("changeDocumentSecurityContext", () => {
  it("normalizes a whitespace-padded entity id before the existence check and persists the trimmed value on Document", async () => {
    const { createDocumentWithFile, changeDocumentSecurityContext } = await import("@/lib/actions/documents");
    const { contract, unit } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Re-contextable doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("securityContextEntityType", "UNIT");
    fd.set("securityContextEntityId", `  ${unit.id}\n`);
    await changeDocumentSecurityContext(fd);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.securityContextEntityType).toBe("UNIT");
    expect(document.securityContextEntityId).toBe(unit.id);
  });

  it("still rejects a cross-organization entity id after normalization - organization scoping is untouched", async () => {
    const { createDocumentWithFile, changeDocumentSecurityContext } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const { contract: contractB } = await createTestContract(orgB);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Re-context cross-org attempt", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("securityContextEntityType", "CONTRACT");
    fd.set("securityContextEntityId", `  ${contractB.id}  `);
    await expect(changeDocumentSecurityContext(fd)).rejects.toThrow();

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.securityContextEntityId).toBe(contract.id); // unchanged
  });
});

describe("Financial isolation (Step 53/91)", () => {
  it("uploading a PAYMENT_RECEIPT document never creates a Payment row", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { invoice } = await seedFinancialsForOrg(orgA);
    const paymentCountBefore = await prisma.payment.count({ where: { organizationId: orgA.organization.id } });
    const storage = newMockStorageProvider();

    await createDocumentWithFile(
      documentFormData({ title: "Bank transfer proof", category: "PAYMENT_RECEIPT", securityContextEntityType: "INVOICE", securityContextEntityId: invoice.id }, pdfFile()),
      { storageProvider: storage }
    );

    expect(await prisma.payment.count({ where: { organizationId: orgA.organization.id } })).toBe(paymentCountBefore);
  });
});

describe("Move-In immutability (Step 49-51/92-94)", () => {
  it("linking a Document to a COMPLETED Move-In never alters the Move-In record, and the existing MoveInAttachment editability rule is unchanged", async () => {
    const { contract } = await createTestContract(orgA);
    const moveInId = await driveMoveInToCompletion(contract.id);
    const moveInBefore = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(moveInBefore.status).toBe("COMPLETED");

    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const storage = newMockStorageProvider();
    await createDocumentWithFile(
      documentFormData({ title: "Move-in handover PDF", category: "MOVE_IN_EVIDENCE", securityContextEntityType: "MOVE_IN", securityContextEntityId: moveInId }, pdfFile()),
      { storageProvider: storage }
    );

    const moveInAfter = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(moveInAfter).toEqual(moveInBefore);

    // The pre-existing MoveInAttachment editability rule (rejecting new
    // attachment metadata on a completed Move-In) must still be enforced
    // exactly as before - Document Management never bypasses or weakens it.
    const { addAttachmentMetadata } = await import("@/lib/actions/move-ins");
    const fd = new FormData();
    fd.set("moveInId", moveInId);
    fd.set("attachmentType", "PHOTO");
    fd.set("fileName", "late-photo.jpg");
    fd.set("mimeType", "image/jpeg");
    await expect(addAttachmentMetadata(fd)).rejects.toThrow();
  });
});

describe("Cross-org / IDOR on reads (Step 69-71)", () => {
  it("an Org B admin cannot read Org A's document via getDocumentDetail, and it never appears in Org B's listDocuments()", async () => {
    const { createDocumentWithFile, getDocumentDetail, listDocuments } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(orgA);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Org A secret", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
      { storageProvider: storage }
    );

    mockAuth.mockResolvedValue(orgB.session);
    await expect(getDocumentDetail(documentId)).rejects.toThrow();
    const { rows } = await listDocuments({});
    expect(rows.some((r) => r.id === documentId)).toBe(false);
  });
});
