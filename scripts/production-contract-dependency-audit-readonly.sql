-- Production Contract-Centric Dependency Audit (READ-ONLY)
--
-- Purpose: prove exactly which live records belong to CTR-2026-00001
-- through CTR-2026-00004 before any cleanup SQL is ever designed. Contract
-- ids are re-resolved live by contractNumber in every section below -
-- never trusted from a prior transcription - per the explicit instruction
-- that accompanied this task.
--
-- This script contains ONLY SELECT statements (optionally using read-only
-- WITH/CTE clauses, which are query-scoped and create no persistent or
-- temporary database object). It is wrapped in an explicit read-only
-- transaction so Postgres itself rejects any accidental mutating
-- statement, as a second layer of defense on top of the fact that no
-- mutating statement is written below.
--
-- Table/column names were verified against the current prisma/schema.prisma
-- (every relevant model re-read directly, not assumed) before this script
-- was written.
--
-- Target-database verification (current_database() = 'neondb') is done by
-- the calling shell script BEFORE this file is ever invoked - this file
-- assumes that check already passed.

\set ON_ERROR_STOP on
\pset pager off
\pset format aligned

BEGIN TRANSACTION READ ONLY;

\echo '================================================================'
\echo 'PHASE 3 - CONTRACT MASTER (ids re-resolved live by contractNumber)'
\echo '================================================================'
SELECT
  c.id AS contract_id,
  c."contractNumber",
  c."organizationId",
  c.status,
  c."startDate",
  c."endDate",
  c."createdAt",
  c."unitId",
  u."unitNumber",
  c."renterId",
  r."fullName" AS renter_display_name,
  b."compoundId",
  cp.name AS compound_name,
  f."buildingId",
  b.name AS building_name,
  u."floorId",
  f."floorNumber",
  c."reservationId",
  (c.id = 'demo-contract-res') AS is_known_seed_contract_res,
  (c.id = 'demo-contract-com') AS is_known_seed_contract_com,
  (c."unitId" IN ('demo-unit-res', 'demo-unit-com')) AS is_known_seed_unit,
  (c."renterId" IN ('demo-renter-individual', 'demo-renter-business')) AS is_known_seed_renter
FROM contracts c
JOIN units u ON u.id = c."unitId"
JOIN renters r ON r.id = c."renterId"
JOIN floors f ON f.id = u."floorId"
JOIN buildings b ON b.id = f."buildingId"
JOIN compounds cp ON cp.id = b."compoundId"
WHERE c."contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
ORDER BY c."contractNumber";

\echo '================================================================'
\echo 'PHASE 4 - FINANCIAL DEPENDENCY MATRIX (per contract, via real FKs)'
\echo '================================================================'

\echo '--- Summary counts per contract ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT
  tc."contractNumber",
  (SELECT count(*) FROM payment_schedules ps WHERE ps."contractId" = tc.id) AS schedule_count,
  (SELECT count(*) FROM invoices i WHERE i."contractId" = tc.id) AS invoice_count,
  (SELECT count(*) FROM invoice_lines il JOIN invoices i2 ON i2.id = il."invoiceId" WHERE i2."contractId" = tc.id) AS invoice_line_count,
  (SELECT count(*) FROM payments p JOIN invoices i3 ON i3.id = p."invoiceId" WHERE i3."contractId" = tc.id) AS payment_count
FROM target_contracts tc
ORDER BY tc."contractNumber";

\echo '--- PaymentSchedule detail ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", ps.id, ps."contractId", ps."installmentNo", ps."dueDate", ps.amount, ps.status, ps."createdAt"
FROM payment_schedules ps
JOIN target_contracts tc ON tc.id = ps."contractId"
ORDER BY tc."contractNumber", ps."installmentNo";

\echo '--- Invoice detail (direct Invoice.contractId FK) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", i.id, i."contractId", i."invoiceNumber", i.status,
       i."totalAmount", i."paidAmount", i."createdAt"
FROM invoices i
JOIN target_contracts tc ON tc.id = i."contractId"
ORDER BY tc."contractNumber", i."invoiceNumber";

\echo '--- InvoiceLine detail (via invoiceId -> Invoice.contractId; InvoiceLine has no organizationId/contractId of its own) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", il.id, il."invoiceId", il.kind, il.description, il."lineTotal"
FROM invoice_lines il
JOIN invoices i ON i.id = il."invoiceId"
JOIN target_contracts tc ON tc.id = i."contractId"
ORDER BY tc."contractNumber", il.id;

\echo '--- Payment detail (via invoiceId -> Invoice.contractId; Payment has no contractId of its own) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", p.id, p."invoiceId", p."receiptNumber", p."referenceNumber",
       p.amount, p.status, p."createdAt",
       (p."receiptNumber" = 'RCT-DEMO-000001' OR p."referenceNumber" = 'SEED-DEMO') AS is_known_seed_payment
FROM payments p
JOIN invoices i ON i.id = p."invoiceId"
JOIN target_contracts tc ON tc.id = i."contractId"
ORDER BY tc."contractNumber", p."createdAt";

\echo '================================================================'
\echo 'PHASE 5 - MOVE-IN / MOVE-OUT DEPENDENCIES'
\echo '================================================================'

\echo '--- MoveOut owned by each contract (contractId is a direct, required FK) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", mo.id AS move_out_id, mo."contractId", mo."unitId", mo."renterId",
       mo.status, mo."createdAt", mo."completedAt"
FROM move_outs mo
JOIN target_contracts tc ON tc.id = mo."contractId"
ORDER BY tc."contractNumber";

\echo '--- MoveOut child record counts (all cascade from moveOutId) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
),
target_move_outs AS (
  SELECT mo.id, tc."contractNumber"
  FROM move_outs mo
  JOIN target_contracts tc ON tc.id = mo."contractId"
)
SELECT
  tmo."contractNumber",
  tmo.id AS move_out_id,
  (SELECT count(*) FROM move_out_inspection_items x WHERE x."moveOutId" = tmo.id) AS inspection_items,
  (SELECT count(*) FROM move_out_inventory_items x WHERE x."moveOutId" = tmo.id) AS inventory_items,
  (SELECT count(*) FROM move_out_meter_readings x WHERE x."moveOutId" = tmo.id) AS meter_readings,
  (SELECT count(*) FROM move_out_key_items x WHERE x."moveOutId" = tmo.id) AS key_items,
  (SELECT count(*) FROM move_out_attachments x WHERE x."moveOutId" = tmo.id) AS attachments
FROM target_move_outs tmo;

\echo '--- Explicit check: are ALL move_out_inspection_items children of the SAME MoveOut found above? (proves no orphan/second MoveOut) ---'
SELECT "moveOutId", count(*) AS item_count
FROM move_out_inspection_items
GROUP BY "moveOutId";

\echo '--- Explicit check: total MoveOut rows in production (must equal 1 per prior inventory; confirms no MoveOut belongs to a 5th, undiscovered contract) ---'
SELECT count(*) AS total_move_outs FROM move_outs;

\echo '--- MoveIn owned by each contract (contractId is a direct, required FK) - expected zero per prior inventory ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", mi.id AS move_in_id, mi."contractId", mi."unitId", mi."renterId",
       mi.status, mi."createdAt", mi."completedAt"
FROM move_ins mi
JOIN target_contracts tc ON tc.id = mi."contractId"
ORDER BY tc."contractNumber";

\echo '================================================================'
\echo 'PHASE 6 - CRM / LEASING DEPENDENCIES (traced via real schema path,'
\echo '          Contract.reservationId -> Reservation.leadId/offerId ->'
\echo '          LeasingOffer/Lead, plus the independent Lead.convertedContractId'
\echo '          back-reference)'
\echo '================================================================'
WITH target_contracts AS (
  SELECT id, "contractNumber", "reservationId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT
  tc."contractNumber",
  tc."reservationId",
  res.id AS reservation_id, res."reservationNumber", res.status AS reservation_status, res."reservedAt",
  res."leadId" AS reservation_lead_id,
  res."offerId" AS reservation_offer_id,
  lo.id AS offer_id, lo."offerNumber", lo.status AS offer_status, lo."viewingId",
  ld.id AS lead_id_via_reservation, ld."leadNumber" AS lead_number_via_reservation, ld.status AS lead_status_via_reservation
FROM target_contracts tc
LEFT JOIN reservations res ON res.id = tc."reservationId"
LEFT JOIN leasing_offers lo ON lo.id = res."offerId"
LEFT JOIN leads ld ON ld.id = res."leadId"
ORDER BY tc."contractNumber";

\echo '--- Independent check: any Lead whose convertedContractId points directly at one of these contracts? ---'
WITH target_contracts AS (
  SELECT id, "contractNumber" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."contractNumber", ld.id AS lead_id, ld."leadNumber", ld.status, ld."convertedContractId"
FROM leads ld
JOIN target_contracts tc ON tc.id = ld."convertedContractId";

\echo '--- Viewings for any Lead discovered above (via Reservation path) ---'
WITH target_contracts AS (
  SELECT id, "contractNumber", "reservationId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
),
related_leads AS (
  SELECT DISTINCT tc."contractNumber", res."leadId"
  FROM target_contracts tc
  JOIN reservations res ON res.id = tc."reservationId"
  WHERE res."leadId" IS NOT NULL
)
SELECT rl."contractNumber", v.id AS viewing_id, v."viewingNumber", v.status, v."scheduledStart"
FROM related_leads rl
JOIN viewings v ON v."leadId" = rl."leadId";

\echo '================================================================'
\echo 'PHASE 7 - UNIT / RENTER SHARED-DEPENDENCY CHECK (which contracts'
\echo '          share the same Unit / Renter as each of our 4 contracts,'
\echo '          derived live from the actual FK, not from names)'
\echo '================================================================'

\echo '--- Every contract sharing the same unit as one of our 4 target contracts ---'
SELECT
  c."contractNumber" AS target_contract,
  u."unitNumber" AS shared_unit,
  other.id AS other_contract_id,
  other."contractNumber" AS other_contract_number,
  other.status AS other_contract_status
FROM contracts c
JOIN units u ON u.id = c."unitId"
JOIN contracts other ON other."unitId" = c."unitId"
WHERE c."contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
ORDER BY shared_unit, other."contractNumber";

\echo '--- Every contract sharing the same renter as one of our 4 target contracts ---'
SELECT
  c."contractNumber" AS target_contract,
  r."fullName" AS shared_renter,
  other.id AS other_contract_id,
  other."contractNumber" AS other_contract_number,
  other.status AS other_contract_status
FROM contracts c
JOIN renters r ON r.id = c."renterId"
JOIN contracts other ON other."renterId" = c."renterId"
WHERE c."contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
ORDER BY shared_renter, other."contractNumber";

\echo '--- Total contracts ever referencing each of the 3 units (sanity check against Phase 7 above) ---'
WITH target_contracts AS (
  SELECT DISTINCT "unitId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."unitId", u."unitNumber", count(c.id) AS contracts_referencing_this_unit
FROM target_contracts tc
JOIN units u ON u.id = tc."unitId"
JOIN contracts c ON c."unitId" = tc."unitId"
GROUP BY tc."unitId", u."unitNumber";

\echo '--- Total contracts ever referencing each of the 3 renters (sanity check against Phase 7 above) ---'
WITH target_contracts AS (
  SELECT DISTINCT "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT tc."renterId", r."fullName", count(c.id) AS contracts_referencing_this_renter
FROM target_contracts tc
JOIN renters r ON r.id = tc."renterId"
JOIN contracts c ON c."renterId" = tc."renterId"
GROUP BY tc."renterId", r."fullName";

\echo '================================================================'
\echo 'PHASE 8 - NON-FK / GENERIC REFERENCE CHECK'
\echo '          (AuditLog.entityType/entityId, Document.securityContextEntityType/Id,'
\echo '          DocumentLink.entityType/entityId, CommunicationMessage.businessEntityType/Id -'
\echo '          none of these are DB-enforced FKs, so they are checked explicitly here)'
\echo '================================================================'

\echo '--- AuditLog rows referencing any of the 4 contracts, their units, or their renters ---'
\echo '    (entityType values confirmed from src/lib/actions/*.ts: PascalCase model names, e.g. "Contract")'
WITH target_contracts AS (
  SELECT id, "contractNumber", "unitId", "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT al.id, al.action, al."entityType", al."entityId", al."createdAt"
FROM audit_logs al
WHERE (al."entityType" = 'Contract' AND al."entityId" IN (SELECT id FROM target_contracts))
   OR (al."entityType" = 'Unit' AND al."entityId" IN (SELECT "unitId" FROM target_contracts))
   OR (al."entityType" = 'Renter' AND al."entityId" IN (SELECT "renterId" FROM target_contracts))
   OR (al."entityType" = 'MoveOut' AND al."entityId" IN (SELECT id FROM move_outs WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'MoveIn' AND al."entityId" IN (SELECT id FROM move_ins WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'Invoice' AND al."entityId" IN (SELECT id FROM invoices WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'Payment' AND al."entityId" IN (
         SELECT p.id FROM payments p JOIN invoices i ON i.id = p."invoiceId"
         WHERE i."contractId" IN (SELECT id FROM target_contracts)))
ORDER BY al."createdAt";

\echo '--- Document.securityContextEntityType/Id referencing the 4 contracts/units/renters (expected empty: documents = 0 in prior inventory) ---'
WITH target_contracts AS (
  SELECT id, "unitId", "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT d.id, d."documentNumber", d."securityContextEntityType", d."securityContextEntityId", d."createdAt"
FROM documents d
WHERE (d."securityContextEntityType" = 'CONTRACT' AND d."securityContextEntityId" IN (SELECT id FROM target_contracts))
   OR (d."securityContextEntityType" = 'UNIT' AND d."securityContextEntityId" IN (SELECT "unitId" FROM target_contracts))
   OR (d."securityContextEntityType" = 'RENTER' AND d."securityContextEntityId" IN (SELECT "renterId" FROM target_contracts));

\echo '--- DocumentLink.entityType/entityId referencing the same set (expected empty) ---'
WITH target_contracts AS (
  SELECT id, "unitId", "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT dl.id, dl."documentId", dl."entityType", dl."entityId", dl."createdAt"
FROM document_links dl
WHERE (dl."entityType" = 'CONTRACT' AND dl."entityId" IN (SELECT id FROM target_contracts))
   OR (dl."entityType" = 'UNIT' AND dl."entityId" IN (SELECT "unitId" FROM target_contracts))
   OR (dl."entityType" = 'RENTER' AND dl."entityId" IN (SELECT "renterId" FROM target_contracts));

\echo '--- CommunicationMessage.businessEntityType/Id referencing the same set (expected empty: communication_messages = 0 in prior inventory) ---'
WITH target_contracts AS (
  SELECT id, "unitId", "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT cm.id, cm."eventType", cm."businessEntityType", cm."businessEntityId", cm."createdAt"
FROM communication_messages cm
WHERE cm."businessEntityId" IN (SELECT id FROM target_contracts)
   OR cm."businessEntityId" IN (SELECT "unitId" FROM target_contracts)
   OR cm."businessEntityId" IN (SELECT "renterId" FROM target_contracts);

\echo '================================================================'
\echo 'PHASE 9 - AUDIT LOG PRESERVATION ANALYSIS'
\echo '          (CORRECTED - a prior revision of this section only checked'
\echo '          entityType IN (Contract, Unit, Renter) and was mislabeled'
\echo '          as "identical to Phase 8''s AuditLog check", which actually'
\echo '          also checks MoveOut/MoveIn/Invoice/Payment. This section now'
\echo '          genuinely covers the same seven entity types as Phase 8.)'
\echo '================================================================'
WITH target_contracts AS (
  SELECT id, "contractNumber", "unitId", "renterId" FROM contracts
  WHERE "contractNumber" IN ('CTR-2026-00001', 'CTR-2026-00002', 'CTR-2026-00003', 'CTR-2026-00004')
)
SELECT al.id AS audit_id, al.action, al."entityType", al."entityId", al."createdAt"
FROM audit_logs al
WHERE (al."entityType" = 'Contract' AND al."entityId" IN (SELECT id FROM target_contracts))
   OR (al."entityType" = 'Unit' AND al."entityId" IN (SELECT "unitId" FROM target_contracts))
   OR (al."entityType" = 'Renter' AND al."entityId" IN (SELECT "renterId" FROM target_contracts))
   OR (al."entityType" = 'MoveOut' AND al."entityId" IN (SELECT id FROM move_outs WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'MoveIn' AND al."entityId" IN (SELECT id FROM move_ins WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'Invoice' AND al."entityId" IN (SELECT id FROM invoices WHERE "contractId" IN (SELECT id FROM target_contracts)))
   OR (al."entityType" = 'Payment' AND al."entityId" IN (
         SELECT p.id FROM payments p JOIN invoices i ON i.id = p."invoiceId"
         WHERE i."contractId" IN (SELECT id FROM target_contracts)))
ORDER BY al."createdAt";

\echo '--- Targeted identification: which Invoice does the action=ISSUE, entityType=Invoice AuditLog row reference? ---'
\echo '    (No JSON metadata/previousValues/newValues selected - only the entityId and the invoice it resolves to.)'
SELECT al.id AS audit_id, al.action, al."entityType", al."entityId" AS invoice_id, al."createdAt",
       i."invoiceNumber", i."contractId", c."contractNumber"
FROM audit_logs al
LEFT JOIN invoices i ON i.id = al."entityId"
LEFT JOIN contracts c ON c.id = i."contractId"
WHERE al.action = 'ISSUE' AND al."entityType" = 'Invoice';

\echo '--- Total AuditLog rows in production (for completeness - must equal 13 per prior inventory) ---'
SELECT count(*) AS total_audit_logs FROM audit_logs;

\echo '================================================================'
\echo 'PHASE 10 - COUNTER SAFETY (read-only; counters are never reset here)'
\echo '================================================================'
SELECT id, "organizationId", key, value
FROM counters
WHERE "organizationId" = 'demo-org'
ORDER BY key;

\echo '================================================================'
\echo 'AUDIT COMPLETE - read-only transaction, committing (no writes occurred)'
\echo '================================================================'

COMMIT;
