import { describe, it, expect } from "vitest";
import { MockEmailProvider, MockWhatsAppProvider, MOCK_PERMANENT_FAILURE_MARKER, MOCK_RETRYABLE_FAILURE_MARKER } from "./mock";

describe("MockEmailProvider", () => {
  const provider = new MockEmailProvider();

  it("succeeds for an ordinary destination", async () => {
    const result = await provider.send({ destination: "renter@example.com", body: "hi", language: "en" });
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toMatch(/^mock-email-/);
  });

  it("deterministically fails permanently for the permanent-failure marker", async () => {
    const result = await provider.send({
      destination: `renter+${MOCK_PERMANENT_FAILURE_MARKER}@example.com`,
      body: "hi",
      language: "en",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_RECIPIENT");
  });

  it("deterministically fails retryably for the retryable-failure marker", async () => {
    const result = await provider.send({
      destination: `renter+${MOCK_RETRYABLE_FAILURE_MARKER}@example.com`,
      body: "hi",
      language: "en",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROVIDER_TIMEOUT");
  });
});

describe("MockWhatsAppProvider", () => {
  const provider = new MockWhatsAppProvider();

  it("succeeds for an ordinary destination", async () => {
    const result = await provider.send({ destination: "+966501234567", body: "hi", language: "ar" });
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toMatch(/^mock-whatsapp-/);
  });

  it("deterministically fails permanently for the permanent-failure marker", async () => {
    const result = await provider.send({ destination: `+1${MOCK_PERMANENT_FAILURE_MARKER}`, body: "hi", language: "ar" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_RECIPIENT");
  });
});
