-- D-011: Compound/Building deletion must not silently destroy ownership or
-- financial history, exactly like D-010 fixed for Unit deletion.
-- property_ownerships.compoundId and property_ownerships.buildingId were
-- ON DELETE CASCADE (an ownership record for a Compound/Building with no
-- other protected child record was silently deleted along with it);
-- owner_ledger_entries.compoundId had the default ON DELETE SET NULL (a
-- financial ledger entry silently lost its Compound reference). All three
-- are now ON DELETE RESTRICT, matching every other protected relation on
-- Compound/Building (maintenance_requests) and matching Unit's own
-- protected relations from D-010, so deleteCompound()/deleteBuilding()'s
-- new P2003 handling (added alongside this migration) blocks the delete
-- with a friendly message instead of losing history.

-- AlterTable
ALTER TABLE "property_ownerships" DROP CONSTRAINT "property_ownerships_compoundId_fkey";
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "property_ownerships" DROP CONSTRAINT "property_ownerships_buildingId_fkey";
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "owner_ledger_entries" DROP CONSTRAINT "owner_ledger_entries_compoundId_fkey";
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
