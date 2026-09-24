import { describe, it, expect } from "vitest";
import { maskEmail, maskPhone, maskDestination } from "./masking";

describe("maskEmail", () => {
  it("keeps the first local-part character and the domain, masks the rest", () => {
    expect(maskEmail("john@example.com")).toBe("j***@example.com");
  });

  it("pads short local parts to at least 3 mask characters", () => {
    expect(maskEmail("jo@example.com")).toBe("j***@example.com");
  });

  it("falls back to a generic mask for a malformed address", () => {
    expect(maskEmail("not-an-email")).toBe("************");
  });
});

describe("maskPhone", () => {
  it("keeps a + country-code prefix and the last 3 digits", () => {
    expect(maskPhone("+966501234567")).toBe("+966******567");
  });

  it("keeps a 3-char prefix when there is no + sign", () => {
    expect(maskPhone("966501234567")).toBe("966******567");
  });

  it("masks everything when the number is too short to partially reveal", () => {
    expect(maskPhone("12345")).toBe("*****");
  });
});

describe("maskDestination", () => {
  it("dispatches to maskEmail for EMAIL", () => {
    expect(maskDestination("john@example.com", "EMAIL")).toBe(maskEmail("john@example.com"));
  });

  it("dispatches to maskPhone for WHATSAPP", () => {
    expect(maskDestination("+966501234567", "WHATSAPP")).toBe(maskPhone("+966501234567"));
  });
});
