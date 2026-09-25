-- D-010: Unit deletion must not silently destroy ownership or financial
-- history. property_ownerships.unitId was ON DELETE CASCADE (an ownership
-- record for a Unit with no rental activity was silently deleted along
-- with the Unit); owner_ledger_entries.unitId had the default ON DELETE
-- SET NULL (a financial ledger entry silently lost its Unit reference).
-- Both are now ON DELETE RESTRICT, matching every other protected relation
-- on Unit (contracts, reservations, move-ins/outs, maintenance requests,
-- etc.) so deleteUnit()'s existing P2003 handling blocks the delete with a
-- friendly message instead of losing history.

-- AlterTable
ALTER TABLE "property_ownerships" DROP CONSTRAINT "property_ownerships_unitId_fkey";
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "owner_ledger_entries" DROP CONSTRAINT "owner_ledger_entries_unitId_fkey";
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
