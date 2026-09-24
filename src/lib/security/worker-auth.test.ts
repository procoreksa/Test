import { describe, it, expect } from "vitest";
import { timingSafeEqualStrings, extractBearerToken, isAuthorizedWorkerRequest } from "./worker-auth";

describe("timingSafeEqualStrings", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualStrings("secret-value", "secret-value")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeEqualStrings("secret-value", "SECRET-VALUE")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(() => timingSafeEqualStrings("short", "a-much-longer-secret")).not.toThrow();
    expect(timingSafeEqualStrings("short", "a-much-longer-secret")).toBe(false);
  });

  it("returns false when either string is empty", () => {
    expect(timingSafeEqualStrings("", "secret")).toBe(false);
    expect(timingSafeEqualStrings("secret", "")).toBe(false);
  });

  it("two empty strings are equal", () => {
    expect(timingSafeEqualStrings("", "")).toBe(true);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Authorization header", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Bearer abc123" } });
    expect(extractBearerToken(req)).toBe("abc123");
  });

  it("returns null when the header is missing", () => {
    const req = new Request("https://example.com");
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when the header doesn't use the Bearer scheme", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Basic abc123" } });
    expect(extractBearerToken(req)).toBeNull();
  });
});

describe("isAuthorizedWorkerRequest", () => {
  it("authorizes a request whose bearer token matches the secret", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Bearer correct-secret" } });
    expect(isAuthorizedWorkerRequest(req, "correct-secret")).toBe(true);
  });

  it("rejects a request with the wrong token", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Bearer wrong-secret" } });
    expect(isAuthorizedWorkerRequest(req, "correct-secret")).toBe(false);
  });

  it("rejects a request with no Authorization header at all", () => {
    const req = new Request("https://example.com");
    expect(isAuthorizedWorkerRequest(req, "correct-secret")).toBe(false);
  });

  it("fails closed when the configured secret is undefined or empty", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Bearer anything" } });
    expect(isAuthorizedWorkerRequest(req, undefined)).toBe(false);
    expect(isAuthorizedWorkerRequest(req, "")).toBe(false);
  });

  it("never authorizes via a query-string token, even if it matches the secret", () => {
    const req = new Request("https://example.com/api/automation/worker?token=correct-secret");
    expect(isAuthorizedWorkerRequest(req, "correct-secret")).toBe(false);
  });
});
