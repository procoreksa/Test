import { pickLocalized } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface UnitLocationRef {
  floor: {
    name: string | null;
    building: {
      name: string;
      nameAr: string | null;
      compound: {
        name: string;
        arabicName: string | null;
      };
    };
  };
}

/**
 * Compound / Building label for a unit, replacing the old
 * `pickLocalized(locale, unit.property.nameAr, unit.property.name)` display
 * pattern now that `Unit.property` is optional and every unit is located via
 * Floor -> Building -> Compound instead.
 */
export function unitLocationLabel(locale: Locale, unit: UnitLocationRef): string {
  const compoundName = pickLocalized(locale, unit.floor.building.compound.arabicName, unit.floor.building.compound.name);
  const buildingName = pickLocalized(locale, unit.floor.building.nameAr, unit.floor.building.name);
  return `${compoundName} / ${buildingName}`;
}
