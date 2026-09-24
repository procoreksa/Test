import { describe, it, expect } from "vitest";
import {
  isDocumentAccessible,
  isPortalDownloadAllowedForStatus,
  isVersionDownloadAllowed,
  isInlinePreviewable,
} from "./visibility";

describe("isDocumentAccessible", () => {
  it("always allows INTERNAL regardless of visibility/entitlement (permission check happens separately)", () => {
    expect(
      isDocumentAccessible({ principalType: "INTERNAL", visibility: "INTERNAL_ONLY", status: "ACTIVE", hasLiveEntitlement: false })
    ).toBe(true);
  });

  it("denies TENANT without live entitlement even if visibility says TENANT_VISIBLE", () => {
    expect(
      isDocumentAccessible({ principalType: "TENANT", visibility: "TENANT_VISIBLE", status: "ACTIVE", hasLiveEntitlement: false })
    ).toBe(false);
  });

  it("denies TENANT with live entitlement but wrong visibility (dual gate)", () => {
    expect(
      isDocumentAccessible({ principalType: "TENANT", visibility: "INTERNAL_ONLY", status: "ACTIVE", hasLiveEntitlement: true })
    ).toBe(false);
    expect(
      isDocumentAccessible({ principalType: "TENANT", visibility: "OWNER_VISIBLE", status: "ACTIVE", hasLiveEntitlement: true })
    ).toBe(false);
  });

  it("allows TENANT only with both TENANT_VISIBLE and live entitlement", () => {
    expect(
      isDocumentAccessible({ principalType: "TENANT", visibility: "TENANT_VISIBLE", status: "ACTIVE", hasLiveEntitlement: true })
    ).toBe(true);
  });

  it("mirrors the same dual gate for OWNER/OWNER_VISIBLE", () => {
    expect(
      isDocumentAccessible({ principalType: "OWNER", visibility: "OWNER_VISIBLE", status: "ACTIVE", hasLiveEntitlement: true })
    ).toBe(true);
    expect(
      isDocumentAccessible({ principalType: "OWNER", visibility: "TENANT_VISIBLE", status: "ACTIVE", hasLiveEntitlement: true })
    ).toBe(false);
  });
});

describe("isPortalDownloadAllowedForStatus", () => {
  it("allows INTERNAL to reach archived documents", () => {
    expect(isPortalDownloadAllowedForStatus("INTERNAL", "ARCHIVED")).toBe(true);
  });

  it("denies TENANT/OWNER access to archived documents by default", () => {
    expect(isPortalDownloadAllowedForStatus("TENANT", "ARCHIVED")).toBe(false);
    expect(isPortalDownloadAllowedForStatus("OWNER", "ARCHIVED")).toBe(false);
  });

  it("allows TENANT/OWNER access to active documents", () => {
    expect(isPortalDownloadAllowedForStatus("TENANT", "ACTIVE")).toBe(true);
    expect(isPortalDownloadAllowedForStatus("OWNER", "ACTIVE")).toBe(true);
  });
});

describe("isVersionDownloadAllowed", () => {
  it("allows INTERNAL to request any version id", () => {
    expect(isVersionDownloadAllowed({ principalType: "INTERNAL", requestedVersionId: "v1", currentVersionId: "v2" })).toBe(true);
  });

  it("allows a portal principal to request only the current version", () => {
    expect(isVersionDownloadAllowed({ principalType: "TENANT", requestedVersionId: "v2", currentVersionId: "v2" })).toBe(true);
  });

  it("denies a portal principal requesting a historical version", () => {
    expect(isVersionDownloadAllowed({ principalType: "TENANT", requestedVersionId: "v1", currentVersionId: "v2" })).toBe(false);
    expect(isVersionDownloadAllowed({ principalType: "OWNER", requestedVersionId: "v1", currentVersionId: "v2" })).toBe(false);
  });
});

describe("isInlinePreviewable", () => {
  it("allows only PDF/JPEG/PNG/WEBP inline", () => {
    expect(isInlinePreviewable("application/pdf")).toBe(true);
    expect(isInlinePreviewable("image/jpeg")).toBe(true);
    expect(isInlinePreviewable("image/png")).toBe(true);
    expect(isInlinePreviewable("image/webp")).toBe(true);
  });

  it("forces everything else to attachment, including HTML/SVG", () => {
    expect(isInlinePreviewable("text/html")).toBe(false);
    expect(isInlinePreviewable("image/svg+xml")).toBe(false);
    expect(isInlinePreviewable("application/octet-stream")).toBe(false);
  });
});
