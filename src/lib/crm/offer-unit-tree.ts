import type { Prisma } from "@prisma/client";

interface RawUnit {
  id: string;
  unitNumber: string;
  unitType: string;
  baseRentAmount: Prisma.Decimal;
}
interface RawFloor {
  id: string;
  name: string | null;
  nameAr: string | null;
  floorNumber: number;
  units: RawUnit[];
}
interface RawBuilding {
  id: string;
  name: string;
  nameAr: string | null;
  floors: RawFloor[];
}
interface RawCompound {
  id: string;
  name: string;
  arabicName: string | null;
  buildings: RawBuilding[];
}

/**
 * Converts getOfferEligibleUnitsTree()'s Decimal baseRentAmount fields to
 * plain numbers - a Server Component cannot pass a Prisma Decimal instance
 * as a prop into a Client Component (OfferUnitPicker), only plain
 * serializable values.
 */
export function serializeUnitsTree(compounds: RawCompound[]) {
  return compounds.map((c) => ({
    ...c,
    buildings: c.buildings.map((b) => ({
      ...b,
      floors: b.floors.map((f) => ({
        ...f,
        units: f.units.map((u) => ({ ...u, baseRentAmount: Number(u.baseRentAmount) })),
      })),
    })),
  }));
}
