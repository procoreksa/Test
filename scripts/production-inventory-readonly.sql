-- Production Data Inventory (READ-ONLY)
--
-- Purpose: gather the production evidence needed to finalize a future demo/
-- UAT data cleanup plan (see docs of the "PRODUCTION DATA AUDIT & CLEANUP
-- READINESS REPORT"). This script contains ONLY SELECT statements. It is
-- wrapped in an explicit read-only transaction so Postgres itself rejects
-- any accidental mutating statement, as a second layer of defense on top of
-- the fact that no mutating statement is written below.
--
-- Table/column names below were verified against the current
-- prisma/schema.prisma (every @@map(...) table name and the field names
-- used here were re-checked against the live schema before this script was
-- written - see the audit report for the verification).
--
-- Target-database verification (current_database() = 'neondb') is done by
-- the calling shell script BEFORE this file is ever invoked - this file
-- assumes that check already passed.

\set ON_ERROR_STOP on
\pset pager off
\pset format aligned

BEGIN TRANSACTION READ ONLY;

\echo '================================================================'
\echo 'A. ORGANIZATIONS'
\echo '================================================================'
SELECT id, name, "nameAr", "subscriptionPlan", "createdAt",
       (id = 'demo-org') AS is_known_seed_org
FROM organizations
ORDER BY "createdAt";

\echo '================================================================'
\echo 'B. INTERNAL STAFF ACCOUNTS (no passwordHash / secrets selected)'
\echo '================================================================'
SELECT id, "organizationId", email, name, role, "isActive", "createdAt",
       (email = 'admin@demo-realestate.sa') AS is_known_seed_staff
FROM users
ORDER BY "organizationId", role, email;

\echo '================================================================'
\echo 'C. TENANT PORTAL ACCOUNTS (no passwordHash / secrets selected)'
\echo '================================================================'
SELECT id, "organizationId", "renterId", status, "suspendedAt", "disabledAt", "createdAt"
FROM tenant_portal_accounts
ORDER BY "createdAt";

\echo '================================================================'
\echo 'D. OWNER PORTAL ACCOUNTS (no passwordHash / secrets selected)'
\echo '================================================================'
SELECT id, "organizationId", "ownerId", status, "suspendedAt", "disabledAt", "createdAt"
FROM owner_portal_accounts
ORDER BY "createdAt";

\echo '================================================================'
\echo 'E. ROW COUNTS FOR EVERY APPLICATION TABLE'
\echo '   (verified against every @@map(...) in prisma/schema.prisma)'
\echo '================================================================'
SELECT 'organizations' AS table_name, count(*) FROM organizations
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'counters', count(*) FROM counters
UNION ALL SELECT 'properties', count(*) FROM properties
UNION ALL SELECT 'compounds', count(*) FROM compounds
UNION ALL SELECT 'buildings', count(*) FROM buildings
UNION ALL SELECT 'floors', count(*) FROM floors
UNION ALL SELECT 'units', count(*) FROM units
UNION ALL SELECT 'renters', count(*) FROM renters
UNION ALL SELECT 'contracts', count(*) FROM contracts
UNION ALL SELECT 'payment_schedules', count(*) FROM payment_schedules
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'invoice_lines', count(*) FROM invoice_lines
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'owners', count(*) FROM owners
UNION ALL SELECT 'property_ownerships', count(*) FROM property_ownerships
UNION ALL SELECT 'owner_ledger_entries', count(*) FROM owner_ledger_entries
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'leads', count(*) FROM leads
UNION ALL SELECT 'lead_activities', count(*) FROM lead_activities
UNION ALL SELECT 'viewings', count(*) FROM viewings
UNION ALL SELECT 'viewing_units', count(*) FROM viewing_units
UNION ALL SELECT 'leasing_offers', count(*) FROM leasing_offers
UNION ALL SELECT 'reservations', count(*) FROM reservations
UNION ALL SELECT 'move_ins', count(*) FROM move_ins
UNION ALL SELECT 'move_in_inspection_items', count(*) FROM move_in_inspection_items
UNION ALL SELECT 'move_in_inventory_items', count(*) FROM move_in_inventory_items
UNION ALL SELECT 'move_in_meter_readings', count(*) FROM move_in_meter_readings
UNION ALL SELECT 'move_in_key_items', count(*) FROM move_in_key_items
UNION ALL SELECT 'move_in_attachments', count(*) FROM move_in_attachments
UNION ALL SELECT 'move_outs', count(*) FROM move_outs
UNION ALL SELECT 'move_out_inspection_items', count(*) FROM move_out_inspection_items
UNION ALL SELECT 'move_out_inventory_items', count(*) FROM move_out_inventory_items
UNION ALL SELECT 'move_out_meter_readings', count(*) FROM move_out_meter_readings
UNION ALL SELECT 'move_out_key_items', count(*) FROM move_out_key_items
UNION ALL SELECT 'move_out_attachments', count(*) FROM move_out_attachments
UNION ALL SELECT 'maintenance_requests', count(*) FROM maintenance_requests
UNION ALL SELECT 'maintenance_work_orders', count(*) FROM maintenance_work_orders
UNION ALL SELECT 'maintenance_vendors', count(*) FROM maintenance_vendors
UNION ALL SELECT 'maintenance_vendor_specialties', count(*) FROM maintenance_vendor_specialties
UNION ALL SELECT 'maintenance_work_logs', count(*) FROM maintenance_work_logs
UNION ALL SELECT 'maintenance_labor_entries', count(*) FROM maintenance_labor_entries
UNION ALL SELECT 'maintenance_part_entries', count(*) FROM maintenance_part_entries
UNION ALL SELECT 'maintenance_cost_entries', count(*) FROM maintenance_cost_entries
UNION ALL SELECT 'maintenance_attachments', count(*) FROM maintenance_attachments
UNION ALL SELECT 'security_deposit_settlements', count(*) FROM security_deposit_settlements
UNION ALL SELECT 'move_out_liability_assessments', count(*) FROM move_out_liability_assessments
UNION ALL SELECT 'security_deposit_ledger_entries', count(*) FROM security_deposit_ledger_entries
UNION ALL SELECT 'security_deposit_refunds', count(*) FROM security_deposit_refunds
UNION ALL SELECT 'security_deposit_settlement_notes', count(*) FROM security_deposit_settlement_notes
UNION ALL SELECT 'tenant_portal_accounts', count(*) FROM tenant_portal_accounts
UNION ALL SELECT 'owner_portal_accounts', count(*) FROM owner_portal_accounts
UNION ALL SELECT 'corporate_accounts', count(*) FROM corporate_accounts
UNION ALL SELECT 'corporate_contacts', count(*) FROM corporate_contacts
UNION ALL SELECT 'corporate_occupants', count(*) FROM corporate_occupants
UNION ALL SELECT 'corporate_housing_allocations', count(*) FROM corporate_housing_allocations
UNION ALL SELECT 'communication_templates', count(*) FROM communication_templates
UNION ALL SELECT 'communication_rules', count(*) FROM communication_rules
UNION ALL SELECT 'communication_messages', count(*) FROM communication_messages
UNION ALL SELECT 'communication_delivery_attempts', count(*) FROM communication_delivery_attempts
UNION ALL SELECT 'communication_preferences', count(*) FROM communication_preferences
UNION ALL SELECT 'documents', count(*) FROM documents
UNION ALL SELECT 'document_versions', count(*) FROM document_versions
UNION ALL SELECT 'document_links', count(*) FROM document_links
UNION ALL SELECT 'communication_outbox_events', count(*) FROM communication_outbox_events
UNION ALL SELECT 'automation_jobs', count(*) FROM automation_jobs
UNION ALL SELECT 'automation_job_attempts', count(*) FROM automation_job_attempts
UNION ALL SELECT 'automation_settings', count(*) FROM automation_settings
UNION ALL SELECT 'automation_scheduler_runs', count(*) FROM automation_scheduler_runs
UNION ALL SELECT 'login_rate_limit_entries', count(*) FROM login_rate_limit_entries
ORDER BY 1;

\echo '================================================================'
\echo 'F. CONTRACT INVENTORY (renter name only, no phone/ID/address)'
\echo '================================================================'
SELECT
  c.id,
  c."contractNumber",
  c."organizationId",
  c."unitId",
  u."unitNumber",
  c."renterId",
  r."fullName" AS renter_display_name,
  c."startDate",
  c."endDate",
  c.status,
  c."createdAt",
  (c.id IN ('demo-contract-res', 'demo-contract-com')) AS is_known_seed_contract,
  (c."unitId" IN ('demo-unit-res', 'demo-unit-com')) AS is_known_seed_unit,
  (c."renterId" IN ('demo-renter-individual', 'demo-renter-business')) AS is_known_seed_renter
FROM contracts c
JOIN units u ON u.id = c."unitId"
JOIN renters r ON r.id = c."renterId"
ORDER BY c."contractNumber";

\echo '================================================================'
\echo 'G. PROPERTY HIERARCHY INVENTORY'
\echo '================================================================'
\echo '--- Compounds ---'
SELECT id, "organizationId", name, "arabicName", "createdAt",
       (id = 'demo-compound') AS is_known_seed_compound
FROM compounds
ORDER BY "createdAt";

\echo '--- Buildings ---'
SELECT id, "organizationId", "compoundId", name, "nameAr", "createdAt",
       (id = 'demo-building') AS is_known_seed_building
FROM buildings
ORDER BY "createdAt";

\echo '--- Floors ---'
SELECT id, "organizationId", "buildingId", "floorNumber", name, "createdAt",
       (id IN ('demo-floor-ground', 'demo-floor-1')) AS is_known_seed_floor
FROM floors
ORDER BY "createdAt";

\echo '--- Units (compound/building derived via floor -> building -> compound) ---'
SELECT
  un.id,
  un."organizationId",
  b."compoundId",
  f."buildingId",
  un."floorId",
  un."unitNumber",
  un.status,
  un."createdAt",
  (un.id IN ('demo-unit-res', 'demo-unit-com')) AS is_known_seed_unit
FROM units un
JOIN floors f ON f.id = un."floorId"
JOIN buildings b ON b.id = f."buildingId"
ORDER BY un."createdAt";

\echo '================================================================'
\echo 'H. RENTER AND OWNER INVENTORY (minimal identification only)'
\echo '================================================================'
\echo '--- Renters (no phone/idNumber/email/address) ---'
SELECT id, "organizationId", "fullName", "idType", "createdAt",
       (id IN ('demo-renter-individual', 'demo-renter-business')) AS is_known_seed_renter
FROM renters
ORDER BY "createdAt";

\echo '--- Owners (no nationalId/iqama/passport/bank details) ---'
SELECT id, "organizationId", name, "createdAt", "deletedAt"
FROM owners
ORDER BY "createdAt";

\echo '================================================================'
\echo 'I. FINANCIAL RECORD SUMMARY (counts by organization only)'
\echo '================================================================'
\echo '--- contracts by organization ---'
SELECT "organizationId", count(*) FROM contracts GROUP BY "organizationId" ORDER BY 1;
\echo '--- payment_schedules by organization ---'
SELECT "organizationId", count(*) FROM payment_schedules GROUP BY "organizationId" ORDER BY 1;
\echo '--- invoices by organization ---'
SELECT "organizationId", count(*) FROM invoices GROUP BY "organizationId" ORDER BY 1;
\echo '--- invoice_lines by organization (invoice_lines has no organizationId of its own; joined via invoices) ---'
SELECT i."organizationId", count(*)
FROM invoice_lines il
JOIN invoices i ON i.id = il."invoiceId"
GROUP BY i."organizationId"
ORDER BY 1;
\echo '--- payments by organization ---'
SELECT "organizationId", count(*) FROM payments GROUP BY "organizationId" ORDER BY 1;
\echo '--- property_ownerships by organization ---'
SELECT "organizationId", count(*) FROM property_ownerships GROUP BY "organizationId" ORDER BY 1;
\echo '--- owner_ledger_entries by organization ---'
SELECT "organizationId", count(*) FROM owner_ledger_entries GROUP BY "organizationId" ORDER BY 1;
\echo '--- security_deposit_settlements by organization ---'
SELECT "organizationId", count(*) FROM security_deposit_settlements GROUP BY "organizationId" ORDER BY 1;
\echo '--- security_deposit_ledger_entries by organization ---'
SELECT "organizationId", count(*) FROM security_deposit_ledger_entries GROUP BY "organizationId" ORDER BY 1;
\echo '--- security_deposit_refunds by organization ---'
SELECT "organizationId", count(*) FROM security_deposit_refunds GROUP BY "organizationId" ORDER BY 1;
\echo '--- move_out_liability_assessments by organization ---'
SELECT "organizationId", count(*) FROM move_out_liability_assessments GROUP BY "organizationId" ORDER BY 1;

\echo '--- Known seed payment/receipt markers (existence check only) ---'
SELECT id, "organizationId", "receiptNumber", "referenceNumber", amount, "createdAt"
FROM payments
WHERE "receiptNumber" = 'RCT-DEMO-000001' OR "referenceNumber" = 'SEED-DEMO';

\echo '================================================================'
\echo 'J. AUTOMATION / COMMUNICATIONS STATE'
\echo '================================================================'
\echo '--- automation_jobs by status ---'
SELECT status, count(*) FROM automation_jobs GROUP BY status ORDER BY status;
\echo '--- communication_messages by status ---'
SELECT status, count(*) FROM communication_messages GROUP BY status ORDER BY status;
\echo '--- communication_outbox_events: processed vs unprocessed ---'
SELECT ("processedAt" IS NULL) AS is_unprocessed, count(*)
FROM communication_outbox_events
GROUP BY 1;
\echo '--- latest 5 automation_scheduler_runs ---'
SELECT id, "ranAt", "resultJson"
FROM automation_scheduler_runs
ORDER BY "ranAt" DESC
LIMIT 5;

\echo '================================================================'
\echo 'K. DOCUMENT METADATA (no storageKey; provider/version counts only)'
\echo '================================================================'
SELECT id, "organizationId", "documentNumber", category, status,
       "securityContextEntityType", "securityContextEntityId", "createdAt"
FROM documents
ORDER BY "createdAt";

\echo '--- document_versions: total count ---'
SELECT count(*) AS document_versions_count FROM document_versions;

\echo '--- document_versions: count by storage provider (no storageKey) ---'
SELECT "storageProvider", count(*) FROM document_versions GROUP BY "storageProvider";

\echo '================================================================'
\echo 'INVENTORY COMPLETE - read-only transaction, committing (no writes occurred)'
\echo '================================================================'

COMMIT;
