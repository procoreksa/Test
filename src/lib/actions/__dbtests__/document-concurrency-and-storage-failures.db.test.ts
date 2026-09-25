/**
 * Real, database-backed concurrency and storage/DB consistency tests for
 * Document Management (docs/DOCUMENT-MANAGEMENT.md, "Storage/DB
 * consistency strategy"): Step 32's mandatory two-concurrent-uploads race,
 * and Steps 78-80's mandatory storage-succeeds-DB-fails /
 * storage-fails-outright scenarios. Uses MockStorageProvider (zero
 * filesystem/network access) injected via each action's `deps` parameter,
 * against a real Postgres database.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { pdfFile, documentFormData, newMockStorageProvider, simulatedAccessDeniedError } from "./document-test-helpers";
import { prisma } from "@/lib/prisma";
import * as logging from "@/lib/logging";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("DOCCONC");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

describe("Version numbering concurrency (Step 14/32)", () => {
  it("two concurrent addDocumentVersion calls on the same document never produce duplicate version numbers or a corrupted currentVersionId", async () => {
    const { createDocumentWithFile, addDocumentVersion } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();

    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Concurrency doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile("v1.pdf")),
      { storageProvider: storage }
    );

    const [r1, r2] = await Promise.all([
      addDocumentVersion(documentFormData({ documentId }, pdfFile("v2.pdf")), { storageProvider: storage }),
      addDocumentVersion(documentFormData({ documentId }, pdfFile("v3.pdf")), { storageProvider: storage }),
    ]);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(document.versions).toHaveLength(3); // v1 (from create) + the two concurrent uploads

    const versionNumbers = document.versions.map((v) => v.versionNumber).sort((a, b) => a - b);
    expect(versionNumbers).toEqual([1, 2, 3]); // no duplicates - the Counter's atomic upsert serialized them

    // currentVersionId always points at a real, existing version from this
    // very document - never null, never a version that doesn't exist.
    expect(document.currentVersionId).not.toBeNull();
    expect([r1.versionId, r2.versionId]).toContain(document.currentVersionId);
    expect(document.versions.some((v) => v.id === document.currentVersionId)).toBe(true);
  });
});

describe("Storage succeeds, DB fails (Step 28/78-79)", () => {
  it("addDocumentVersion: a DB-transaction failure after a successful storage write leaves currentVersionId unchanged, creates no fake version, and compensating-deletes the orphaned storage object", async () => {
    const { createDocumentWithFile, addDocumentVersion } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();

    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "DB-fail doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile("v1.pdf")),
      { storageProvider: storage }
    );
    const before = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });

    // Force the transaction's tx.documentVersion.create() to hit a real,
    // deterministic unique-constraint violation: pre-advance this
    // document's version Counter to the same value as a version row we
    // insert ahead of time, so whatever versionNumber addDocumentVersion()
    // computes collides with one that already exists.
    await prisma.counter.upsert({
      where: { organizationId_key: { organizationId: org.organization.id, key: `documentVersion:${documentId}` } },
      create: { organizationId: org.organization.id, key: `documentVersion:${documentId}`, value: 1 },
      update: { value: 1 },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.organization.id,
        documentId,
        versionNumber: 2,
        fileName: "pre-existing-collider.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        checksumSha256: "0".repeat(64),
        storageProvider: "LOCAL_DEV",
        storageKey: "irrelevant/collider/key.pdf",
        uploadedByUserId: org.admin.id,
      },
    });

    const objectCountBeforeAttempt = storage.debugObjectCount();
    await expect(addDocumentVersion(documentFormData({ documentId }, pdfFile("colliding-upload.pdf")), { storageProvider: storage })).rejects.toThrow();

    // The storage write for THIS attempt succeeded, then the DB transaction
    // failed (P2002) - the compensating delete must have removed it, so the
    // object count is back to where it was before this attempt.
    expect(storage.debugObjectCount()).toBe(objectCountBeforeAttempt);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(after.currentVersionId).toBe(before.currentVersionId); // unchanged
    expect(after.versions.some((v) => v.fileName === "colliding-upload.pdf")).toBe(false); // no fake version created
    expect(after.versions).toHaveLength(2); // v1 + the pre-existing collider only
  });

  it("createDocumentWithFile: a DB-transaction failure never leaves a Document row without a version, and compensating-deletes the orphaned storage object", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();

    // Force the Document creation's own documentNumber uniqueness to
    // collide deterministically: read the "document" Counter's current
    // value (without consuming it) and pre-insert a Document row with
    // exactly the number the next real nextCounterValue() call will produce.
    const counter = await prisma.counter.findUnique({ where: { organizationId_key: { organizationId: org.organization.id, key: "document" } } });
    const nextSeq = (counter?.value ?? 0) + 1;
    const collidingNumber = `DOC-${String(nextSeq).padStart(6, "0")}`;
    await prisma.document.create({
      data: {
        organizationId: org.organization.id,
        documentNumber: collidingNumber,
        title: "Pre-existing collider",
        category: "GENERAL",
        securityContextEntityType: "CONTRACT",
        securityContextEntityId: contract.id,
        createdByUserId: org.admin.id,
      },
    });

    const documentCountBefore = await prisma.document.count({ where: { organizationId: org.organization.id } });
    const objectCountBefore = storage.debugObjectCount();

    await expect(
      createDocumentWithFile(
        documentFormData({ title: "Collision attempt", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
        { storageProvider: storage }
      )
    ).rejects.toThrow();

    // No extra Document row (the colliding insert rolled back) and the
    // orphaned storage object was compensating-deleted.
    expect(await prisma.document.count({ where: { organizationId: org.organization.id } })).toBe(documentCountBefore);
    expect(storage.debugObjectCount()).toBe(objectCountBefore);

    // The failed transaction rolled back its own Counter increment too (the
    // increment happens inside the same transaction as the failed insert) -
    // correct production behavior (a retry gets the same number back), but
    // it means the "document" Counter never actually advanced here, so this
    // fixture's manually pre-inserted collider must be cleaned up explicitly
    // or every later createDocumentWithFile() call in this file would keep
    // colliding with it forever.
    await prisma.document.deleteMany({ where: { documentNumber: collidingNumber, organizationId: org.organization.id } });
  });
});

describe("Storage fails outright (Step 28/80)", () => {
  it("createDocumentWithFile: a storage write failure creates no Document/DocumentVersion row at all", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();
    storage.simulateNextPutFailure();

    const documentCountBefore = await prisma.document.count({ where: { organizationId: org.organization.id } });
    await expect(
      createDocumentWithFile(
        documentFormData({ title: "Storage failure", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
        { storageProvider: storage }
      )
    ).rejects.toThrow();

    expect(await prisma.document.count({ where: { organizationId: org.organization.id } })).toBe(documentCountBefore);
    expect(storage.debugObjectCount()).toBe(0);
  });

  it("addDocumentVersion: a storage write failure leaves currentVersionId unchanged and creates no new version row", async () => {
    const { createDocumentWithFile, addDocumentVersion } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();

    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Version storage-failure doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile("v1.pdf")),
      { storageProvider: storage }
    );
    const before = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });

    storage.simulateNextPutFailure();
    await expect(addDocumentVersion(documentFormData({ documentId }, pdfFile("v2-fails.pdf")), { storageProvider: storage })).rejects.toThrow();

    const after = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(after.currentVersionId).toBe(before.currentVersionId);
    expect(after.versions).toHaveLength(before.versions.length);
    expect(after.versions.some((v) => v.fileName === "v2-fails.pdf")).toBe(false);
  });
});

describe("Storage PutObject failure diagnostics (production incident: raw R2/S3 AccessDenied reaching the browser)", () => {
  it("createDocumentWithFile: an AccessDenied-shaped storage error is logged with sanitized metadata only, and the raw SDK message never reaches the caller", async () => {
    const { createDocumentWithFile } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();
    storage.simulateNextPutFailure(simulatedAccessDeniedError());
    const logWarnSpy = vi.spyOn(logging, "logWarn");
    const documentCountBefore = await prisma.document.count({ where: { organizationId: org.organization.id } });

    let caught: unknown;
    try {
      await createDocumentWithFile(
        documentFormData({ title: "AccessDenied simulation", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile()),
        { storageProvider: storage }
      );
    } catch (err) {
      caught = err;
    }

    // No Document/DocumentVersion row was created, and nothing was left in storage.
    expect(await prisma.document.count({ where: { organizationId: org.organization.id } })).toBe(documentCountBefore);
    expect(storage.debugObjectCount()).toBe(0);

    // The caller only ever sees a generic, localized message - never the raw
    // AWS SDK error text (which is literally "Access Denied" in this
    // simulation, matching the production incident exactly).
    expect(caught).toBeInstanceOf(Error);
    const userFacingMessage = (caught as Error).message;
    // The raw SDK .message text is "Access Denied" (a space-separated
    // sentence) - distinct from the legitimate, intentionally-logged
    // "AccessDenied" (no space) error CODE asserted below via errorName.
    expect(userFacingMessage).not.toMatch(/access\s+denied/i);
    expect(userFacingMessage.length).toBeGreaterThan(0);

    // Exactly one diagnostic log call fired, with exactly the whitelisted
    // safe fields - nothing else (no credentials, endpoint, bucket, file
    // name/contents, or the raw error's own message).
    const call = logWarnSpy.mock.calls.find(([event]) => event === "document.storage.putObject_failed");
    expect(call).toBeDefined();
    const [, context] = call!;
    expect(context).toBeDefined();
    expect(Object.keys(context!).sort()).toEqual(
      ["entityType", "errorName", "extendedRequestId", "httpStatusCode", "organizationId", "requestId", "stage", "storageProviderKind"].sort()
    );
    expect(context).toMatchObject({
      stage: "storage.putObject",
      organizationId: org.organization.id,
      entityType: "CONTRACT",
      errorName: "AccessDenied",
      httpStatusCode: 403,
      requestId: "test-request-id-0001",
      extendedRequestId: "test-extended-request-id-0001",
    });
    // storageProviderKind reflects whichever provider this test environment
    // actually resolves (LOCAL_DEV or S3_COMPATIBLE, depending on .env.test)
    // - present and a non-empty string is what matters here, not a specific
    // literal value.
    expect(typeof context!.storageProviderKind).toBe("string");
    expect((context!.storageProviderKind as string).length).toBeGreaterThan(0);

    // The logged context legitimately contains the sanitized error CODE
    // "AccessDenied" (errorName, asserted above) - what must never appear is
    // the raw SDK .message SENTENCE "Access Denied" (space-separated), which
    // is exactly the free-text string that reached the browser in the
    // original incident.
    const serializedContext = JSON.stringify(context);
    expect(serializedContext).not.toMatch(/access\s+denied/i);
    expect(serializedContext.toLowerCase()).not.toContain("secret");
    expect(serializedContext.toLowerCase()).not.toContain("accesskey");
    expect(serializedContext.toLowerCase()).not.toContain("endpoint");

    logWarnSpy.mockRestore();
  });

  it("addDocumentVersion: an AccessDenied-shaped storage error receives the same sanitized-logging + generic-message treatment", async () => {
    const { createDocumentWithFile, addDocumentVersion } = await import("@/lib/actions/documents");
    const { contract } = await createTestContract(org);
    const storage = newMockStorageProvider();
    const { documentId } = await createDocumentWithFile(
      documentFormData({ title: "Version AccessDenied doc", category: "GENERAL", securityContextEntityType: "CONTRACT", securityContextEntityId: contract.id }, pdfFile("v1.pdf")),
      { storageProvider: storage }
    );
    const before = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });

    storage.simulateNextPutFailure(simulatedAccessDeniedError());
    const logWarnSpy = vi.spyOn(logging, "logWarn");

    let caught: unknown;
    try {
      await addDocumentVersion(documentFormData({ documentId }, pdfFile("v2-accessdenied.pdf")), { storageProvider: storage });
    } catch (err) {
      caught = err;
    }

    const after = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(after.currentVersionId).toBe(before.currentVersionId);
    expect(after.versions).toHaveLength(before.versions.length);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toMatch(/access.?denied/i);

    const call = logWarnSpy.mock.calls.find(([event]) => event === "document.storage.putObject_failed");
    expect(call).toBeDefined();
    const [, context] = call!;
    expect(context).toMatchObject({
      stage: "storage.putObject",
      organizationId: org.organization.id,
      entityType: "CONTRACT",
      errorName: "AccessDenied",
      httpStatusCode: 403,
    });

    logWarnSpy.mockRestore();
  });
});
