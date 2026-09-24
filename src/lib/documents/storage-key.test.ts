import { describe, it, expect } from "vitest";
import { generateStorageKey, extensionForMimeType } from "./storage-key";

describe("generateStorageKey", () => {
  it("produces an org-scoped, entity-scoped key with a random unpredictable suffix", () => {
    const key = generateStorageKey({ organizationId: "org_abc", entityType: "CONTRACT", entityId: "ctr_1", fileExtension: ".pdf" });
    expect(key.startsWith("org_abc/contract/ctr_1/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("never incorporates the original filename - only a random token", () => {
    const key1 = generateStorageKey({ organizationId: "org_abc", entityType: "CONTRACT", entityId: "ctr_1", fileExtension: ".pdf" });
    const key2 = generateStorageKey({ organizationId: "org_abc", entityType: "CONTRACT", entityId: "ctr_1", fileExtension: ".pdf" });
    expect(key1).not.toBe(key2);
  });

  it("sanitizes a malicious/oversized extension rather than embedding it raw", () => {
    const key = generateStorageKey({ organizationId: "org_abc", entityType: "UNIT", entityId: "u1", fileExtension: "/../../evil.sh" });
    expect(key).not.toContain("..");
    expect(key).not.toContain("/evil");
  });

  it("lowercases the entity type segment", () => {
    const key = generateStorageKey({ organizationId: "org_abc", entityType: "MOVE_IN", entityId: "mi1", fileExtension: ".jpg" });
    expect(key.startsWith("org_abc/move_in/mi1/")).toBe(true);
  });
});

describe("extensionForMimeType", () => {
  it("maps each allowed MIME type to its extension", () => {
    expect(extensionForMimeType("application/pdf")).toBe(".pdf");
    expect(extensionForMimeType("image/jpeg")).toBe(".jpg");
    expect(extensionForMimeType("image/png")).toBe(".png");
    expect(extensionForMimeType("image/webp")).toBe(".webp");
  });

  it("returns an empty string for an unknown type", () => {
    expect(extensionForMimeType("text/html")).toBe("");
  });
});
