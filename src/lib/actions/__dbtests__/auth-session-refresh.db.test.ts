/**
 * Hardening (docs/SECURITY-REVIEW.md, "Stale session / authentication
 * boundaries"): real, database-backed tests for refreshSessionClaims(),
 * the function the JWT callback (src/lib/auth.ts) now calls periodically
 * to re-verify a session's role/organization/active-status. Proves the
 * three cases that matter: a still-active user gets fresh claims back
 * (including a picked-up role change), and a deactivated user gets null
 * (which the JWT callback treats as "end this session").
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { refreshSessionClaims } from "@/lib/auth-session-refresh";

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("SESS");
});

describe("refreshSessionClaims", () => {
  it("returns the user's current role/organization for a still-active user", async () => {
    const fresh = await refreshSessionClaims(org.admin.id);
    expect(fresh).not.toBeNull();
    expect(fresh?.role).toBe("ADMIN");
    expect(fresh?.organizationId).toBe(org.organization.id);
  });

  it("picks up a role change made after the session was originally issued", async () => {
    await prisma.user.update({ where: { id: org.admin.id }, data: { role: "VIEWER" } });
    const fresh = await refreshSessionClaims(org.admin.id);
    expect(fresh?.role).toBe("VIEWER");
    await prisma.user.update({ where: { id: org.admin.id }, data: { role: "ADMIN" } }); // restore for other tests sharing this fixture
  });

  it("returns null once the user is deactivated - the JWT callback ends the session on this", async () => {
    await prisma.user.update({ where: { id: org.admin.id }, data: { isActive: false } });
    const fresh = await refreshSessionClaims(org.admin.id);
    expect(fresh).toBeNull();
    await prisma.user.update({ where: { id: org.admin.id }, data: { isActive: true } }); // restore
  });

  it("returns null for a user id that no longer exists", async () => {
    const fresh = await refreshSessionClaims("nonexistent-user-id");
    expect(fresh).toBeNull();
  });
});
