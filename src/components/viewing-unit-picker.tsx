"use client";

import { useMemo, useState } from "react";
import { pickLocalized } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface EligibleUnit {
  id: string;
  unitNumber: string;
  unitType: string;
}

export interface EligibleFloor {
  id: string;
  name: string | null;
  nameAr: string | null;
  floorNumber: number;
  units: EligibleUnit[];
}

export interface EligibleBuilding {
  id: string;
  name: string;
  nameAr: string | null;
  floors: EligibleFloor[];
}

export interface EligibleCompound {
  id: string;
  name: string;
  arabicName: string | null;
  buildings: EligibleBuilding[];
}

/**
 * Compound -> Building -> Floor -> Unit cascading picker that accumulates
 * multiple selected units (Step 20/3 - a viewing may cover more than one
 * unit). Submits each selection as a separate hidden `unitIds` input, so
 * the surrounding <form> reads them all via `formData.getAll("unitIds")`.
 * Only VACANT units are offered at all - the tree passed in
 * (getViewingEligibleUnitsTree()) is already filtered server-side.
 */
export function ViewingUnitPicker({
  compounds,
  locale,
  labels,
}: {
  compounds: EligibleCompound[];
  locale: Locale;
  labels: {
    compound: string;
    building: string;
    floor: string;
    unit: string;
    addUnit: string;
    selectedTitle: string;
    remove: string;
    noneSelected: string;
  };
}) {
  const [compoundId, setCompoundId] = useState(compounds[0]?.id ?? "");
  const compound = compounds.find((c) => c.id === compoundId);

  const [buildingId, setBuildingId] = useState(compound?.buildings[0]?.id ?? "");
  const building = compound?.buildings.find((b) => b.id === buildingId);

  const floors = building?.floors ?? [];
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "");
  const floor = floors.find((f) => f.id === floorId);

  const units = floor?.units ?? [];
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");

  const [selected, setSelected] = useState<Array<{ id: string; label: string }>>([]);

  const allUnitsById = useMemo(() => {
    const map = new Map<string, EligibleUnit>();
    for (const c of compounds) for (const b of c.buildings) for (const f of b.floors) for (const u of f.units) map.set(u.id, u);
    return map;
  }, [compounds]);

  function handleCompoundChange(nextCompoundId: string) {
    setCompoundId(nextCompoundId);
    const nextCompound = compounds.find((c) => c.id === nextCompoundId);
    const nextBuilding = nextCompound?.buildings[0];
    setBuildingId(nextBuilding?.id ?? "");
    const nextFloor = nextBuilding?.floors[0];
    setFloorId(nextFloor?.id ?? "");
    setUnitId(nextFloor?.units[0]?.id ?? "");
  }

  function handleBuildingChange(nextBuildingId: string) {
    setBuildingId(nextBuildingId);
    const nextBuilding = compound?.buildings.find((b) => b.id === nextBuildingId);
    const nextFloor = nextBuilding?.floors[0];
    setFloorId(nextFloor?.id ?? "");
    setUnitId(nextFloor?.units[0]?.id ?? "");
  }

  function handleFloorChange(nextFloorId: string) {
    setFloorId(nextFloorId);
    const nextFloor = floors.find((f) => f.id === nextFloorId);
    setUnitId(nextFloor?.units[0]?.id ?? "");
  }

  function addUnit() {
    if (!unitId || selected.some((s) => s.id === unitId)) return;
    const unit = allUnitsById.get(unitId);
    if (!unit) return;
    const label = `${pickLocalized(locale, compound?.arabicName, compound?.name ?? "")} / ${pickLocalized(locale, building?.nameAr, building?.name ?? "")} / ${unit.unitNumber}`;
    setSelected((prev) => [...prev, { id: unitId, label }]);
  }

  function removeUnit(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="md:col-span-2 space-y-3">
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
          <div className="flex gap-2">
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {units.length === 0 && <option value="">—</option>}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNumber}
                </option>
              ))}
            </select>
            <button type="button" onClick={addUnit} disabled={!unitId} className="shrink-0 rounded-lg bg-brand-gold hover:bg-brand-gold-dark text-brand-black px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {labels.addUnit}
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">{labels.selectedTitle}</p>
        {selected.length === 0 ? (
          <p className="text-sm text-slate-400">{labels.noneSelected}</p>
        ) : (
          <ul className="space-y-1">
            {selected.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <span>{s.label}</span>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="unitIds" value={s.id} />
                  <button type="button" onClick={() => removeUnit(s.id)} className="text-red-500 hover:underline text-xs">
                    {labels.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
