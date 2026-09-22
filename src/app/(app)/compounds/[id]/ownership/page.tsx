import { getCompoundById } from "@/lib/actions/compounds";
import { OwnershipManager } from "@/components/ownership-manager";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function CompoundOwnershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [compound, locale] = await Promise.all([getCompoundById(id), getLocale()]);
  const t = getDictionary(locale);

  return (
    <OwnershipManager
      level="COMPOUND"
      assetId={compound.id}
      assetLabel={pickLocalized(locale, compound.arabicName, compound.name)}
      backHref="/compounds"
      backLabel={t.compounds.title}
    />
  );
}
