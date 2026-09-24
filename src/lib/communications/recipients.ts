import type { CommunicationRecipientStrategy, CommunicationRecipientType } from "@prisma/client";

/**
 * A concrete, already-resolved recipient a business action offers to
 * enqueueCommunicationEvent() for one of its CommunicationRecipientStrategy
 * options. Deliberately built by the CALLER (the business action already
 * has the relevant Renter/Owner/CorporateContact/CorporateOccupant/User row
 * loaded from its own query) rather than re-resolved generically inside the
 * enqueue layer from a bare (businessEntityType, businessEntityId) pair -
 * see docs/NOTIFICATIONS-COMMUNICATIONS.md, "Recipient resolution
 * architecture" for why. The `build*Recipient()` helpers below are pure
 * mapping functions (no DB access themselves) so a caller's own DB query
 * result can be turned into a CandidateRecipient with no duplicated
 * mapping logic and no chance of picking the wrong field.
 */
export interface CandidateRecipient {
  strategy: CommunicationRecipientStrategy;
  recipientType: CommunicationRecipientType;
  recipientId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export function buildRenterRecipient(renter: { id: string; fullName: string; email: string | null; phone: string | null }): CandidateRecipient {
  return { strategy: "RENTER", recipientType: "RENTER", recipientId: renter.id, displayName: renter.fullName, email: renter.email, phone: renter.phone };
}

export function buildOwnerRecipient(owner: { id: string; name: string; email: string | null; mobile: string | null }): CandidateRecipient {
  return { strategy: "OWNER", recipientType: "OWNER", recipientId: owner.id, displayName: owner.name, email: owner.email, phone: owner.mobile };
}

export function buildCorporatePrimaryContactRecipient(contact: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}): CandidateRecipient {
  return {
    strategy: "CORPORATE_PRIMARY_CONTACT",
    recipientType: "CORPORATE_CONTACT",
    recipientId: contact.id,
    displayName: contact.name,
    email: contact.email,
    phone: contact.phone,
  };
}

export function buildCorporateHousingContactRecipient(occupant: {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}): CandidateRecipient {
  return {
    strategy: "CORPORATE_HOUSING_CONTACT",
    recipientType: "CORPORATE_OCCUPANT",
    recipientId: occupant.id,
    displayName: occupant.fullName,
    email: occupant.email,
    phone: occupant.phone,
  };
}

export function buildAssignedStaffRecipient(user: { id: string; name: string; email: string }): CandidateRecipient {
  return { strategy: "ASSIGNED_STAFF", recipientType: "INTERNAL_USER", recipientId: user.id, displayName: user.name, email: user.email, phone: null };
}

export function buildSpecificInternalUserRecipient(user: { id: string; name: string; email: string }): CandidateRecipient {
  return {
    strategy: "SPECIFIC_INTERNAL_USER",
    recipientType: "INTERNAL_USER",
    recipientId: user.id,
    displayName: user.name,
    email: user.email,
    phone: null,
  };
}

/**
 * Picks the candidate a given CommunicationRule wants, if the caller
 * supplied one. SPECIFIC_INTERNAL_USER additionally requires the
 * candidate's id to match the Rule's own fixed specificUserId - a caller
 * offering some other internal user under that strategy is never
 * substituted for the Rule's configured one.
 */
export function findCandidateForStrategy(
  candidates: readonly CandidateRecipient[],
  strategy: CommunicationRecipientStrategy,
  specificUserId?: string | null
): CandidateRecipient | undefined {
  if (strategy === "SPECIFIC_INTERNAL_USER") {
    return candidates.find((c) => c.strategy === strategy && c.recipientId === specificUserId);
  }
  return candidates.find((c) => c.strategy === strategy);
}
