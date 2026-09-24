import { describe, it, expect } from "vitest";
import { buildIdempotencyKey } from "./idempotency";

describe("buildIdempotencyKey", () => {
  const base = {
    eventType: "INVOICE_ISSUED",
    businessEntityType: "Invoice",
    businessEntityId: "inv1",
    channel: "EMAIL",
    recipientType: "RENTER",
    recipientId: "renter1",
  };

  it("is deterministic for identical inputs (idempotent retry)", () => {
    expect(buildIdempotencyKey(base)).toBe(buildIdempotencyKey({ ...base }));
  });

  it("differs when the channel differs (multi-channel fan-out)", () => {
    expect(buildIdempotencyKey(base)).not.toBe(buildIdempotencyKey({ ...base, channel: "WHATSAPP" }));
  });

  it("differs when the recipient differs", () => {
    expect(buildIdempotencyKey(base)).not.toBe(buildIdempotencyKey({ ...base, recipientId: "renter2" }));
  });

  it("differs when the business entity differs", () => {
    expect(buildIdempotencyKey(base)).not.toBe(buildIdempotencyKey({ ...base, businessEntityId: "inv2" }));
  });
});
