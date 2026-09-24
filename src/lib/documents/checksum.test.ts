import { describe, it, expect } from "vitest";
import { computeSha256 } from "./checksum";
import { createHash } from "crypto";

describe("computeSha256", () => {
  it("matches Node's own createHash for the same input", () => {
    const buf = Buffer.from("hello world");
    expect(computeSha256(buf)).toBe(createHash("sha256").update(buf).digest("hex"));
  });

  it("is deterministic for the same bytes", () => {
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    expect(computeSha256(buf)).toBe(computeSha256(Buffer.from(buf)));
  });

  it("differs for different bytes", () => {
    expect(computeSha256(Buffer.from("a"))).not.toBe(computeSha256(Buffer.from("b")));
  });
});
