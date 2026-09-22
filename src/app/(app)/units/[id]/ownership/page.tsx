import { getUnitById } from "@/lib/actions/units";
import { OwnershipManager } from "@/components/ownership-manager";
import { unitLocationLabel } from "@/lib/unit-location";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function UnitOwnershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [unit, locale] = await Promise.all([getUnitById(id), getLocale()]);
  const t = getDictionary(locale);
  const label = `${unitLocationLabel(locale, unit)} / ${unit.unitNumber}`;

  return <OwnershipManager level="UNIT" assetId={unit.id} assetLabel={label} backHref="/units" backLabel={t.units.title} />;
}
