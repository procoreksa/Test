"use client";

import { useState } from "react";
import { pickLocalized } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface OfferEligibleUnit {
  id: string;
  unitNumber: string;
  unitType: string;
  baseRentAmount: number;
}

export interface OfferEligibleFloor {
  id: string;
  name: string | null;
  nameAr: string | null;
  floorNumber: number;
  units: OfferEligibleUnit[];
}

export interface OfferEligibleBuilding {
  id: string;
  name: string;
  nameAr: string | null;
  floors: OfferEligibleFloor[];
}

export interface OfferEligibleCompound {
  id: string;
  name: string;
  arabicName: string | null;
  buildings: OfferEligibleBuilding[];
}

/**
 * Compound -> Building -> Floor -> Unit cascading picker for a SINGLE unit
 * (Step 3/9 - an Offer targets exactly one primary Unit, unlike Viewing's
 * multi-select ViewingUnitPicker). Deliberately a new, separate component
 * rather than reusing ViewingUnitPicker or CascadingLocationPicker - neither
 * has the right contract (accumulate-many vs. resolve-a-new-unit's-floor) -
 * see docs/LEASING-OFFERS.md, "Reused, not duplicated".
 */
export function OfferUnitPicker({
  compounds,
  locale,
  labels,
  defaultUnitId,
  onUnitChange,
}: {
  compounds: OfferEligibleCompound[];
  locale: Locale;
  labels: { compound: string; building: string; floor: string; unit: string };
  defaultUnitId?: string;
  onUnitChange?: (unit: OfferEligibleUnit | null) => void;
}) {
  function findLocation(unitId: string | undefined) {
    for (const c of compounds) {
      for (const b of c.buildings) {
        for (const f of b.floors) {
          if (f.units.some((u) => u.id === unitId)) return { compoundId: c.id, buildingId: b.id, floorId: f.id };
        }
      }
    }
    return null;
  }

  const initialLocation = findLocation(defaultUnitId);

  const [compoundId, setCompoundId] = useState(initialLocation?.compoundId ?? compounds[0]?.id ?? "");
  const compound = compounds.find((c) => c.id === compoundId);

  const [buildingId, setBuildingId] = useState(initialLocation?.buildingId ?? compound?.buildings[0]?.id ?? "");
  const building = compound?.buildings.find((b) => b.id === buildingId);

  const floors = building?.floors ?? [];
  const [floorId, setFloorId] = useState(initialLocation?.floorId ?? floors[0]?.id ?? "");
  const floor = floors.find((f) => f.id === floorId);

  const units = floor?.units ?? [];
  const [unitId, setUnitId] = useState(defaultUnitId ?? units[0]?.id ?? "");

  function notify(nextUnitId: string, unitPool: OfferEligibleUnit[]) {
    onUnitChange?.(unitPool.find((u) => u.id === nextUnitId) ?? null);
  }

  function handleCompoundChange(nextCompoundId: string) {
    setCompoundId(nextCompoundId);
    const nextCompound = compounds.find((c) => c.id === nextCompoundId);
    const nextBuilding = nextCompound?.buildings[0];
    setBuildingId(nextBuilding?.id ?? "");
    const nextFloor = nextBuilding?.floors[0];
    setFloorId(nextFloor?.id ?? "");
    const nextUnits = nextFloor?.units ?? [];
    setUnitId(nextUnits[0]?.id ?? "");
    notify(nextUnits[0]?.id ?? "", nextUnits);
  }

  function handleBuildingChange(nextBuildingId: string) {
    setBuildingId(nextBuildingId);
    const nextBuilding = compound?.buildings.find((b) => b.id === nextBuildingId);
    const nextFloor = nextBuilding?.floors[0];
    setFloorId(nextFloor?.id ?? "");
    const nextUnits = nextFloor?.units ?? [];
    setUnitId(nextUnits[0]?.id ?? "");
    notify(nextUnits[0]?.id ?? "", nextUnits);
  }

  function handleFloorChange(nextFloorId: string) {
    setFloorId(nextFloorId);
    const nextFloor = floors.find((f) => f.id === nextFloorId);
    const nextUnits = nextFloor?.units ?? [];
    setUnitId(nextUnits[0]?.id ?? "");
    notify(nextUnits[0]?.id ?? "", nextUnits);
  }

  function handleUnitChange(nextUnitId: string) {
    setUnitId(nextUnitId);
    notify(nextUnitId, units);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.compound}</label>
        <select value={compoundId} onChange={(e) => handleCompoundChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {pickLocalized(locale, c.arabicName, c.name)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.building}</label>
        <select value={buildingId} onChange={(e) => handleBuildingChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {(compound?.buildings ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {pickLocalized(locale, b.nameAr, b.name)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.floor}</label>
        <select value={floorId} onChange={(e) => handleFloorChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {pickLocalized(locale, f.nameAr, f.name ?? String(f.floorNumber))}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.unit}</label>
        <select name="unitId" value={unitId} onChange={(e) => handleUnitChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {units.length === 0 && <option value="">—</option>}
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.unitNumber}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
