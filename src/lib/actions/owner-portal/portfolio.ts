"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal, requireOwnerUnitAccess } from "@/lib/owner-session";
import { resolveOwnerEffectiveUnits } from "@/lib/owner-portfolio-query";
import { computeOccupancySummary } from "@/lib/owner-portfolio-rules";
import { notFound } from "next/navigation";

/**
 * Owner-safe portfolio DTOs. Every query is self-scoped from the
 * authenticated owner's own session (`requireOwnerPrincipal()`) and
 * resolved through `resolveOwnerEffectiveUnits()` - the single, shared
 * ownership-resolution primitive (src/lib/owner-portfolio-query.ts) - never
 * a second ownership engine, and never inferred from Contract/Unit
 * location/organizationId alone.
 */

/** Same safe, already-public-facing branding subset (name/logo) the Tenant Portal's own getTenantOrganizationBranding() exposes - never any internal organization configuration. */
export async function getOwnerPortalOrganizationBranding() {
  const { organizationId } = await requireOwnerPrincipal();
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, nameAr: true, logoUrl: true } });
}

export interface OwnerPortalCompoundSummary {
  compoundId: string;
  compoundName: string;
  compoundArabicName: string | null;
  buildingCount: number;
  unitCount: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
}

/** Step 19/44 - Portfolio view: only Compounds where the owner effectively owns at least one Unit, grouped and rolled up. Ownership percentage is deliberately NOT shown at this level (a compound can mix uniform ownership with unit-level overrides at different percentages) - see getOwnerPortalUnits() for the unambiguous per-unit figure. */
export async function getOwnerPortalProperties(): Promise<OwnerPortalCompoundSummary[]> {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const units = await resolveOwnerEffectiveUnits(organizationId, ownerId);

  const byCompound = new Map<string, typeof units>();
  for (const unit of units) {
    const list = byCompound.get(unit.compoundId) ?? [];
    list.push(unit);
    byCompound.set(unit.compoundId, list);
  }

  const result: OwnerPortalCompoundSummary[] = [];
  for (const [compoundId, compoundUnits] of byCompound) {
    const occupancy = computeOccupancySummary(compoundUnits.map((u) => u.status));
    result.push({
      compoundId,
      compoundName: compoundUnits[0].compoundName,
      compoundArabicName: compoundUnits[0].compoundArabicName,
      buildingCount: new Set(compoundUnits.map((u) => u.buildingId)).size,
      unitCount: occupancy.total,
      occupied: occupancy.occupied,
      vacant: occupancy.vacant,
      occupancyRate: occupancy.occupancyRate,
    });
  }
  return result.sort((a, b) => a.compoundName.localeCompare(b.compoundName));
}

export interface OwnerPortalPropertyDetailUnit {
  unitId: string;
  unitNumber: string;
  status: string;
  buildingName: string;
  buildingNameAr: string | null;
  floorName: string | null;
  ownershipPercentage: string;
}

export interface OwnerPortalPropertyDetail {
  compoundId: string;
  compoundName: string;
  compoundArabicName: string | null;
  units: OwnerPortalPropertyDetailUnit[];
  occupancy: ReturnType<typeof computeOccupancySummary>;
}

/**
 * Property detail (properties/[id]) is deliberately filtered from
 * resolveOwnerEffectiveUnits() rather than gated by a single whole-compound
 * entitlement check: an owner who owns only one Unit within a Compound
 * (never the Compound itself) must still be able to open this page and see
 * that one Unit - anti-enumeration then falls out naturally, since an id
 * that doesn't exist and an id the owner owns nothing in both produce the
 * identical empty-set notFound() (docs/OWNER-PORTAL.md, "Anti-
 * enumeration").
 */
export async function getOwnerPortalPropertyDetail(compoundId: string): Promise<OwnerPortalPropertyDetail> {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const units = await resolveOwnerEffectiveUnits(organizationId, ownerId);
  const mine = units.filter((u) => u.compoundId === compoundId);
  if (mine.length === 0) notFound();

  return {
    compoundId,
    compoundName: mine[0].compoundName,
    compoundArabicName: mine[0].compoundArabicName,
    occupancy: computeOccupancySummary(mine.map((u) => u.status)),
    units: mine
      .map((u) => ({
        unitId: u.unitId,
        unitNumber: u.unitNumber,
        status: u.status,
        buildingName: u.buildingName,
        buildingNameAr: u.buildingNameAr,
        floorName: u.floorName,
        ownershipPercentage: u.ownershipPercentage.toString(),
      }))
      .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)),
  };
}

export interface OwnerPortalUnitRow {
  unitId: string;
  unitNumber: string;
  status: string;
  compoundName: string;
  compoundArabicName: string | null;
  buildingName: string;
  buildingNameAr: string | null;
  ownershipPercentage: string;
}

export async function getOwnerPortalUnits(): Promise<OwnerPortalUnitRow[]> {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const units = await resolveOwnerEffectiveUnits(organizationId, ownerId);
  return units
    .map((u) => ({
      unitId: u.unitId,
      unitNumber: u.unitNumber,
      status: u.status,
      compoundName: u.compoundName,
      compoundArabicName: u.compoundArabicName,
      buildingName: u.buildingName,
      buildingNameAr: u.buildingNameAr,
      ownershipPercentage: u.ownershipPercentage.toString(),
    }))
    .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
}

/**
 * Unit detail (units/[id]) uses requireOwnerUnitAccess() directly - a
 * single-asset entitlement check, correctly resolving the same Unit ->
 * Building -> Compound override chain for exactly this one Unit id.
 * High-level Move-In/Move-Out status only (Step 45/72): no inspection
 * notes, no tenant acknowledgement detail - just the current status enum,
 * matching the spec's explicit "no dedicated modules" instruction.
 */
export async function getOwnerPortalUnitDetail(unitId: string) {
  const { unit, organizationId, ownerId } = await requireOwnerUnitAccess(unitId);
  const units = await resolveOwnerEffectiveUnits(organizationId, ownerId);
  const mine = units.find((u) => u.unitId === unitId);
  if (!mine) notFound();

  const [activeContract, latestMoveIn, latestMoveOut] = await Promise.all([
    prisma.contract.findFirst({
      where: { organizationId, unitId, status: "ACTIVE" },
      select: { id: true, contractNumber: true, rentAmount: true, paymentFrequency: true, startDate: true, endDate: true, renter: { select: { fullName: true, fullNameAr: true } } },
    }),
    prisma.moveIn.findFirst({ where: { organizationId, contract: { unitId } }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    prisma.moveOut.findFirst({ where: { organizationId, contract: { unitId } }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);

  return {
    unit: {
      id: unit.id,
      unitNumber: unit.unitNumber,
      status: unit.status,
      buildingName: mine.buildingName,
      buildingNameAr: mine.buildingNameAr,
      compoundName: mine.compoundName,
      compoundArabicName: mine.compoundArabicName,
      floorName: mine.floorName,
      ownershipPercentage: mine.ownershipPercentage.toString(),
    },
    activeContract,
    moveInStatus: latestMoveIn?.status ?? null,
    moveOutStatus: latestMoveOut?.status ?? null,
  };
}
