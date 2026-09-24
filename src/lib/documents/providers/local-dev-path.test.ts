import { describe, it, expect } from "vitest";
import path from "path";
import { resolveWithinBaseDir } from "./local-dev-path";

describe("resolveWithinBaseDir", () => {
  const base = "/var/document-storage";

  it("resolves an ordinary nested key inside the base dir", () => {
    const result = resolveWithinBaseDir(base, "org1/contract/c1/abc123.pdf");
    expect(result).toBe(path.resolve(base, "org1/contract/c1/abc123.pdf"));
  });

  it("rejects a key that escapes the base dir via ../", () => {
    expect(resolveWithinBaseDir(base, "../../etc/passwd")).toBeNull();
  });

  it("rejects a key that is an absolute path", () => {
    expect(resolveWithinBaseDir(base, "/etc/passwd")).toBeNull();
  });

  it("rejects an embedded null byte", () => {
    expect(resolveWithinBaseDir(base, "org1/contract\0/x")).toBeNull();
  });

  it("rejects an empty key", () => {
    expect(resolveWithinBaseDir(base, "")).toBeNull();
  });

  it("rejects a cleverly nested traversal that still escapes", () => {
    expect(resolveWithinBaseDir(base, "org1/../../../etc/passwd")).toBeNull();
  });
});
