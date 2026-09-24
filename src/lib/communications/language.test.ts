import { describe, it, expect } from "vitest";
import { resolveNotificationLanguage } from "./language";

describe("resolveNotificationLanguage", () => {
  it("resolves ar for an ar request locale", () => {
    expect(resolveNotificationLanguage("ar")).toBe("ar");
  });

  it("falls back to en for an en request locale", () => {
    expect(resolveNotificationLanguage("en")).toBe("en");
  });

  it("falls back to en when no locale is available", () => {
    expect(resolveNotificationLanguage(null)).toBe("en");
    expect(resolveNotificationLanguage(undefined)).toBe("en");
  });

  it("falls back to en for an unrecognized value", () => {
    expect(resolveNotificationLanguage("fr")).toBe("en");
  });
});
