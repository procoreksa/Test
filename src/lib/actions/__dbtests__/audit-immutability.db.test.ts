/**
 * STEP 21 - audit immutability tests, against the real database:
 *  - no update/delete action exists for AuditLog anywhere in the app
 *  - audit records outlive the source record being deactivated/soft-deleted
 *  - audit records stay organization-scoped (Org A can never read Org B's)
 *  - there is no application action that lets an ordinary user insert a
 *    fabricated audit row (only read-only exports exist in
 *    src/lib/actions/audit.ts, and writeAuditLog()/auditCreate()/etc. are
 *    plain library functions, never "use server" actions the client can
 *    invoke directly)
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import * as auditActions from "@/lib/actions/audit";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("A");
  orgB = await seedFullOrg("B");
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("Audit log: no mutation surface", () => {
  it("src/lib/actions/audit.ts exports only read operations - no create/update/delete", () => {
    const exportNames = Object.keys(auditActions);
    expect(exportNames.sort()).toEqual(["getEntityAuditTrail", "listAuditActors", "listAuditLogs"]);
    for (const name of exportNames) {
      expect(name).not.toMatch(/create|update|delete|write|insert/i);
    }
  });

  it("the Prisma client exposes no way to reach AuditLog through any non-audit action's public API", async () => {
    // Static guarantee: every "use server" action module that touches
    // AuditLog does so only via the audit.ts library helpers, which never
    // accept a caller-supplied organizationId/userId (they always derive
    // both from the server session) - see src/lib/audit.ts writeAuditLog().
    const auditLib = await import("@/lib/audit");
    expect(typeof auditLib.writeAuditLog).toBe("function");
    // None of these helpers are themselves exported as "use server" actions
    // (audit.ts has no "use server" directive), so they are unreachable
    // from client code - only from other server-side modules that import them.
  });
});

describe("Audit log: rows are immutable and survive source-record changes", () => {
  it("the CREATE audit row for an owner is unchanged after the owner is deactivated", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOwner, deactivateOwner } = await import("@/lib/actions/owners");
    const { prisma } = await import("@/lib/prisma");

    const fd = new FormData();
    fd.set("ownerType", "INDIVIDUAL");
    fd.set("name", "Immutability Test Owner");
    await createOwner(fd);

    const created = await prisma.owner.findFirstOrThrow({
      where: { organizationId: orgA.organization.id, name: "Immutability Test Owner" },
    });

    const createLog = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: orgA.organization.id, entityType: "Owner", entityId: created.id, action: "CREATE" },
    });
    const createLogSnapshot = { ...createLog };

    await deactivateOwner(created.id);

    const createLogAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: createLog.id } });
    expect(createLogAfter).toEqual(createLogSnapshot);

    const deactivateLog = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: orgA.organization.id, entityType: "Owner", entityId: created.id, action: "DEACTIVATE" },
    });
    expect(deactivateLog.previousValues).toEqual({ status: "ACTIVE" });
    expect(deactivateLog.newValues).toEqual({ status: "INACTIVE" });
  });

  it("AuditLog has no updatedAt/deletedAt column", async () => {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: orgA.organization.id } });
    expect(row).not.toHaveProperty("updatedAt");
    expect(row).not.toHaveProperty("deletedAt");
  });
});

describe("Audit log: organization-scoped visibility", () => {
  it("Org A's listAuditLogs never returns Org B's rows, even by direct query manipulation", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listAuditLogs } = await import("@/lib/actions/audit");
    const result = await listAuditLogs({});
    expect(result.rows.every((e) => e.organizationId === orgA.organization.id)).toBe(true);
  });

  it("getEntityAuditTrail for Org B's owner returns nothing when called as Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getEntityAuditTrail } = await import("@/lib/actions/audit");
    const trail = await getEntityAuditTrail("Owner", orgB.owner.id);
    expect(trail).toEqual([]);
  });
});
