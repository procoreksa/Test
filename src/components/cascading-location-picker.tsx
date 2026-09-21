"use client";

import { useState } from "react";
import { pickLocalized } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface LocationTreeFloor {
  id: string;
  name: string | null;
  nameAr: string | null;
  floorNumber: number;
}

export interface LocationTreeBuilding {
  id: string;
  name: string;
  nameAr: string | null;
  floors: LocationTreeFloor[];
}

export interface LocationTreeCompound {
  id: string;
  name: string;
  arabicName: string | null;
  buildings: LocationTreeBuilding[];
}

/**
 * Compound -> Building -> Floor dependent selects. Submits the chosen leaf
 * Floor's id under `fieldName` (defaults to "floorId") - that's the only
 * value the surrounding form actually needs, since Unit.floorId already
 * implies its building and compound.
 */
export function CascadingLocationPicker({
  compounds,
  locale,
  fieldName = "floorId",
  labels,
}: {
  compounds: LocationTreeCompound[];
  locale: Locale;
  fieldName?: string;
  labels: { compound: string; building: string; floor: string };
}) {
  const [compoundId, setCompoundId] = useState(compounds[0]?.id ?? "");
  const compound = compounds.find((c) => c.id === compoundId);

  const [buildingId, setBuildingId] = useState(compound?.buildings[0]?.id ?? "");
  const building = compound?.buildings.find((b) => b.id === buildingId);

  const floors = building?.floors ?? [];
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "");

  function handleCompoundChange(nextCompoundId: string) {
    setCompoundId(nextCompoundId);
    const nextCompound = compounds.find((c) => c.id === nextCompoundId);
    const nextBuilding = nextCompound?.buildings[0];
    setBuildingId(nextBuilding?.id ?? "");
    setFloorId(nextBuilding?.floors[0]?.id ?? "");
  }

  function handleBuildingChange(nextBuildingId: string) {
    setBuildingId(nextBuildingId);
    const nextBuilding = compound?.buildings.find((b) => b.id === nextBuildingId);
    setFloorId(nextBuilding?.floors[0]?.id ?? "");
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.compound}</label>
        <select
          value={compoundId}
          onChange={(e) => handleCompoundChange(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {pickLocalized(locale, c.arabicName, c.name)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.building}</label>
        <select
          value={buildingId}
          onChange={(e) => handleBuildingChange(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          {(compound?.buildings ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {pickLocalized(locale, b.nameAr, b.name)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.floor}</label>
        <select
          name={fieldName}
          value={floorId}
          onChange={(e) => setFloorId(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {pickLocalized(locale, f.nameAr, f.name ?? String(f.floorNumber))}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
