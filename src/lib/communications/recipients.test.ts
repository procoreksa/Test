import { describe, it, expect } from "vitest";
import {
  buildRenterRecipient,
  buildOwnerRecipient,
  buildCorporatePrimaryContactRecipient,
  buildCorporateHousingContactRecipient,
  buildAssignedStaffRecipient,
  buildSpecificInternalUserRecipient,
  findCandidateForStrategy,
} from "./recipients";

describe("recipient builders", () => {
  it("buildRenterRecipient maps Renter fields to a RENTER candidate", () => {
    expect(buildRenterRecipient({ id: "r1", fullName: "John Doe", email: "john@example.com", phone: "0501234567" })).toEqual({
      strategy: "RENTER",
      recipientType: "RENTER",
      recipientId: "r1",
      displayName: "John Doe",
      email: "john@example.com",
      phone: "0501234567",
    });
  });

  it("buildOwnerRecipient maps Owner.mobile (not .phone) to the candidate's phone", () => {
    expect(buildOwnerRecipient({ id: "o1", name: "Acme Holdings", email: null, mobile: "0559999999" }).phone).toBe("0559999999");
  });

  it("buildCorporatePrimaryContactRecipient maps to CORPORATE_CONTACT", () => {
    expect(buildCorporatePrimaryContactRecipient({ id: "c1", name: "Jane", email: "jane@corp.com", phone: null }).recipientType).toBe(
      "CORPORATE_CONTACT"
    );
  });

  it("buildCorporateHousingContactRecipient maps to CORPORATE_OCCUPANT", () => {
    expect(
      buildCorporateHousingContactRecipient({ id: "occ1", fullName: "Employee One", email: null, phone: "0501111111" }).recipientType
    ).toBe("CORPORATE_OCCUPANT");
  });

  it("buildAssignedStaffRecipient and buildSpecificInternalUserRecipient both map to INTERNAL_USER with distinct strategies", () => {
    const staff = buildAssignedStaffRecipient({ id: "u1", name: "Staff One", email: "staff@org.com" });
    const specific = buildSpecificInternalUserRecipient({ id: "u2", name: "Staff Two", email: "staff2@org.com" });
    expect(staff.recipientType).toBe("INTERNAL_USER");
    expect(specific.recipientType).toBe("INTERNAL_USER");
    expect(staff.strategy).toBe("ASSIGNED_STAFF");
    expect(specific.strategy).toBe("SPECIFIC_INTERNAL_USER");
  });
});

describe("findCandidateForStrategy", () => {
  const candidates = [
    buildRenterRecipient({ id: "r1", fullName: "John", email: "john@example.com", phone: null }),
    buildSpecificInternalUserRecipient({ id: "u1", name: "Staff", email: "staff@org.com" }),
  ];

  it("finds a non-specific-user strategy by strategy alone", () => {
    expect(findCandidateForStrategy(candidates, "RENTER")?.recipientId).toBe("r1");
  });

  it("returns undefined when no candidate matches the requested strategy", () => {
    expect(findCandidateForStrategy(candidates, "OWNER")).toBeUndefined();
  });

  it("matches SPECIFIC_INTERNAL_USER only when the recipientId matches the rule's specificUserId", () => {
    expect(findCandidateForStrategy(candidates, "SPECIFIC_INTERNAL_USER", "u1")?.recipientId).toBe("u1");
    expect(findCandidateForStrategy(candidates, "SPECIFIC_INTERNAL_USER", "someOtherUser")).toBeUndefined();
  });
});
