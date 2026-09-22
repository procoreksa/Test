"use client";

import { useState } from "react";
import { pickLocalized } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface TreeUnit {
  id: string;
  unitNumber: string;
}
interface TreeFloor {
  id: string;
  name: string | null;
  nameAr: string | null;
  floorNumber: number;
  units: TreeUnit[];
}
interface TreeBuilding {
  id: string;
  name: string;
  nameAr: string | null;
  floors: TreeFloor[];
}
interface TreeCompound {
  id: string;
  name: string;
  arabicName: string | null;
  buildings: TreeBuilding[];
}

/**
 * Compound -> Building -> Floor -> Unit dependent selects for the "New
 * Maintenance Request" form's UNIT scope (Step 43) - submits the leaf
 * Unit's id under `fieldName` (default "unitId"). Server-side
 * resolveMaintenanceLocation() re-derives and verifies the full hierarchy
 * from that Unit id alone - this component is a convenience UI, never the
 * source of truth.
 */
export function MaintenanceUnitPicker({
  compounds,
  locale,
  fieldName = "unitId",
  labels,
  onUnitChange,
}: {
  compounds: TreeCompound[];
  locale: Locale;
  fieldName?: string;
  labels: { compound: string; building: string; floor: string; unit: string };
  onUnitChange?: (unitId: string) => void;
}) {
  const [compoundId, setCompoundId] = useState(compounds[0]?.id ?? "");
  const compound = compounds.find((c) => c.id === compoundId);

  const [buildingId, setBuildingId] = useState(compound?.buildings[0]?.id ?? "");
  const building = compound?.buildings.find((b) => b.id === buildingId);

  const [floorId, setFloorId] = useState(building?.floors[0]?.id ?? "");
  const floor = building?.floors.find((f) => f.id === floorId);

  const units = floor?.units ?? [];
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");

  function selectUnit(nextUnitId: string) {
    setUnitId(nextUnitId);
    onUnitChange?.(nextUnitId);
  }

  function handleCompoundChange(nextCompoundId: string) {
    setCompoundId(nextCompoundId);
    const nextCompound = compounds.find((c) => c.id === nextCompoundId);
    const nextBuilding = nextCompound?.buildings[0];
    const nextFloor = nextBuilding?.floors[0];
    setBuildingId(nextBuilding?.id ?? "");
    setFloorId(nextFloor?.id ?? "");
    selectUnit(nextFloor?.units[0]?.id ?? "");
  }

  function handleBuildingChange(nextBuildingId: string) {
    setBuildingId(nextBuildingId);
    const nextBuilding = compound?.buildings.find((b) => b.id === nextBuildingId);
    const nextFloor = nextBuilding?.floors[0];
    setFloorId(nextFloor?.id ?? "");
    selectUnit(nextFloor?.units[0]?.id ?? "");
  }

  function handleFloorChange(nextFloorId: string) {
    setFloorId(nextFloorId);
    const nextFloor = building?.floors.find((f) => f.id === nextFloorId);
    selectUnit(nextFloor?.units[0]?.id ?? "");
  }

  return (
    <>
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
          {(building?.floors ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {pickLocalized(locale, f.nameAr, f.name ?? String(f.floorNumber))}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{labels.unit}</label>
        <select name={fieldName} value={unitId} onChange={(e) => selectUnit(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.unitNumber}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
