import { describe, it, expect } from "vitest";
import { isSupportedPayload } from "@/lib/automation/outbox-processor";
import { OUTBOX_PAYLOAD_VERSION } from "@/lib/automation/outbox-emit";

const validPayload = {
  businessEntityType: "Invoice",
  businessEntityId: "inv1",
  language: "en",
  variables: { invoiceNumber: "INV-1" },
  recipients: [],
};

describe("isSupportedPayload (Step 14 - payload version guard)", () => {
  it("accepts a well-formed payload at the current version", () => {
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION, validPayload)).toBe(true);
  });

  it("rejects an unrecognized/incompatible payloadVersion, even with an otherwise-valid shape", () => {
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION + 1, validPayload)).toBe(false);
    expect(isSupportedPayload(0, validPayload)).toBe(false);
  });

  it("rejects a payload missing required fields at the current version", () => {
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION, { ...validPayload, businessEntityType: undefined })).toBe(false);
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION, { ...validPayload, recipients: "not-an-array" })).toBe(false);
  });

  it("rejects null/non-object payloads", () => {
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION, null)).toBe(false);
    expect(isSupportedPayload(OUTBOX_PAYLOAD_VERSION, "a string")).toBe(false);
  });
});
