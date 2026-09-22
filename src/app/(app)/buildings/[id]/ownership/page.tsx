import { getBuildingById } from "@/lib/actions/buildings";
import { OwnershipManager } from "@/components/ownership-manager";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function BuildingOwnershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [building, locale] = await Promise.all([getBuildingById(id), getLocale()]);
  const t = getDictionary(locale);
  const label = `${pickLocalized(locale, building.compound.arabicName, building.compound.name)} / ${pickLocalized(locale, building.nameAr, building.name)}`;

  return (
    <OwnershipManager level="BUILDING" assetId={building.id} assetLabel={label} backHref="/buildings" backLabel={t.buildings.title} />
  );
}
