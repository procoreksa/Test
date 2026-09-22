/**
 * STEP 37/38 - real, database-backed cross-organization security and IDOR
 * tests for Reservation -> Contract conversion, following the exact
 * pattern established by reservation-cross-org-security.db.test.ts: two
 * real seeded organizations, only the NextAuth session boundary mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createConvertibleReservation, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("CCA");
  orgB = await seedFullOrg("CCB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("Reservation -> Contract cross-organization isolation", () => {
  it("Admin A cannot convert Reservation B, and no Contract is created", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { reservation: reservationB } = await createConvertibleReservation(orgB);

    await expect(convertReservationToContract(reservationB.id)).rejects.toThrow();

    const contractCount = await prisma.contract.count({ where: { reservationId: reservationB.id } });
    expect(contractCount).toBe(0);
    const stillConfirmed = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationB.id } });
    expect(stillConfirmed.status).toBe("CONFIRMED");
  });

  it("Admin A cannot read Org B's conversion preview", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getReservationConversionPreview } = await import("@/lib/actions/reservation-contract");
    const { reservation: reservationB } = await createConvertibleReservation(orgB);
    await expect(getReservationConversionPreview(reservationB.id)).rejects.toThrow();
  });

  it("Admin B (reverse direction) cannot convert Reservation A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { reservation: reservationA } = await createConvertibleReservation(orgA);
    await expect(convertReservationToContract(reservationA.id)).rejects.toThrow();
  });

  it("Admin A cannot see Org B's converted Contract via getConvertedContractForOffer", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { convertReservationToContract, getConvertedContractForOffer } = await import("@/lib/actions/reservation-contract");
    const { offer: offerB, reservation: reservationB } = await createConvertibleReservation(orgB);
    await convertReservationToContract(reservationB.id);

    mockAuth.mockResolvedValue(orgA.session);
    const result = await getConvertedContractForOffer(offerB.id);
    expect(result).toBeNull();
  });
});

describe("Reservation -> Contract IDOR: positive control", () => {
  it("Admin A can convert Org A's own Reservation normally", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { reservation } = await createConvertibleReservation(orgA);
    const contractId = await convertReservationToContract(reservation.id);
    expect(contractId).toBeTruthy();
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.organizationId).toBe(orgA.organization.id);
  });
});
