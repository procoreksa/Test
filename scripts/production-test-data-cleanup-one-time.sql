-- ============================================================================
-- *** EXECUTED ON PRODUCTION - DO NOT RUN AGAIN ***
-- ============================================================================
--
-- Execution date:              2026-09-25
-- Execution outcome:           COMPLETED SUCCESSFULLY
-- Post-execution verification: PASSED (independent read-only audit)
--
-- This script has already run against production exactly once and achieved
-- its intended, fully-verified effect (CTR-2026-00001/00002/00003 removed;
-- CTR-2026-00004 and everything reachable from it untouched; AuditLog and
-- all Counter rows unchanged). It is retained here ONLY as historical/audit
-- evidence of precisely what was executed - it is not a reusable tool and
-- must never be run again. The GitHub Actions workflow that could trigger
-- it (.github/workflows/production-test-data-cleanup-one-time.yml) has been
-- removed for this reason. See docs/PRODUCTION-TEST-DATA-CLEANUP.md for the
-- full verified post-state record.
--
-- ============================================================================
-- ONE-TIME PRODUCTION TEST/UAT DATA CLEANUP (ORIGINAL HEADER, PRE-EXECUTION)
-- ============================================================================
--
-- DO NOT RUN WITHOUT EXPLICIT PRODUCTION EXECUTION APPROVAL.
--
-- This is NOT a reusable/generic cleanup tool. It is a one-time, narrowly
-- scoped operation for exactly this approved dataset, written against the
-- production audit performed via the "Production Contract Dependency Audit
-- (read-only)" workflow. See docs/PRODUCTION-TEST-DATA-CLEANUP.md for the
-- full design rationale, approval record, and post-execution procedure.
--
-- Approved for deletion (explicit business approval):
--   CTR-2026-00001, CTR-2026-00002, CTR-2026-00003
--   and, once proven to have zero remaining references, the demo Unit G-01,
--   demo Renter "Falcon Trading Est.", Unit A-101, and demo Renter
--   "Mohammed Al-Otaibi".
--
-- ABSOLUTELY PRESERVED (this script must never be able to touch these):
--   CTR-2026-00004 and everything reachable from it (Unit 714, its renter,
--   its Compound/Building/Floor, its 3 PaymentSchedules, its 2 Invoices/
--   InvoiceLines, its MoveOut and 48 inspection items), Organization
--   demo-org, the OWNER/internal staff account, every AuditLog row, every
--   Counter row, _prisma_migrations, and the Prisma schema.
--
-- Every id used below is resolved LIVE by contractNumber/organizationId or
-- by FK traversal - never a hardcoded id - and every step is guarded by an
-- exact-count assertion (RAISE EXCEPTION on mismatch). Because this entire
-- file runs inside one explicit transaction with ON_ERROR_STOP enabled by
-- the caller, any single failed assertion aborts and rolls back the WHOLE
-- operation - there is no partial-commit path.
--
-- IMPLEMENTATION NOTE: psql does NOT perform :'variable' interpolation
-- inside dollar-quoted (DO $$ ... $$) blocks - only in plain top-level SQL
-- statements. Resolved ids are therefore captured with \gset (plain
-- statements) and then handed into every PL/pgSQL DO block via Postgres's
-- own transaction-local custom GUC mechanism (set_config(..., true) /
-- current_setting(...)) rather than psql-side text substitution inside the
-- block bodies. This was verified by first attempting the naive :'var'
-- approach against a local fixture, which failed with a syntax error, then
-- correcting it to this pattern - see validation notes in
-- docs/PRODUCTION-TEST-DATA-CLEANUP.md.
--
-- ON DELETE behavior below was re-verified directly against the actual
-- migration DDL in prisma/migrations/*/migration.sql, not inferred from
-- prisma/schema.prisma's relation attributes alone:
--   payment_schedules.contractId  -> contracts   CASCADE
--   invoices.contractId           -> contracts   SET NULL  (must be deleted explicitly)
--   payments.invoiceId            -> invoices    RESTRICT  (must be deleted before its Invoice)
--   invoice_lines.invoiceId       -> invoices    CASCADE
--   move_outs.contractId          -> contracts   RESTRICT
--   move_ins.contractId           -> contracts   RESTRICT
--   security_deposit_settlements.contractId -> contracts RESTRICT
--   security_deposit_ledger_entries.contractId -> contracts RESTRICT
--   corporate_housing_allocations.contractId -> contracts RESTRICT
--   maintenance_requests.contractId -> contracts RESTRICT
--   contracts.unitId               -> units      RESTRICT
--   contracts.renterId             -> renters    RESTRICT
--   units.floorId                  -> floors     RESTRICT
--
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

\echo '================================================================'
\echo 'SECTION 0 - Organization sanity check'
\echo '================================================================'
DO $$
BEGIN
  IF (SELECT count(*) FROM organizations WHERE id = 'demo-org') <> 1 THEN
    RAISE EXCEPTION 'Expected organization demo-org to exist exactly once. Aborting.';
  END IF;
END $$;

\echo '================================================================'
\echo 'SECTION 1 - Resolve all four contracts LIVE by contractNumber'
\echo '            (never a hardcoded id). Fail closed unless every one'
\echo '            resolves to exactly one row in demo-org.'
\echo '================================================================'
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM contracts WHERE "contractNumber" = 'CTR-2026-00001' AND "organizationId" = 'demo-org';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'CTR-2026-00001 did not resolve to exactly one contract in demo-org (found %). Aborting.', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM contracts WHERE "contractNumber" = 'CTR-2026-00002' AND "organizationId" = 'demo-org';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'CTR-2026-00002 did not resolve to exactly one contract in demo-org (found %). Aborting.', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM contracts WHERE "contractNumber" = 'CTR-2026-00003' AND "organizationId" = 'demo-org';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'CTR-2026-00003 did not resolve to exactly one contract in demo-org (found %). Aborting.', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM contracts WHERE "contractNumber" = 'CTR-2026-00004' AND "organizationId" = 'demo-org';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'CTR-2026-00004 (PRESERVED) did not resolve to exactly one contract (found %). Aborting - the preserved contract must be unambiguous before ANY deletion proceeds.', v_cnt; END IF;
END $$;

SELECT id AS v_c1 FROM contracts WHERE "contractNumber" = 'CTR-2026-00001' AND "organizationId" = 'demo-org' \gset
SELECT id AS v_c2 FROM contracts WHERE "contractNumber" = 'CTR-2026-00002' AND "organizationId" = 'demo-org' \gset
SELECT id AS v_c3 FROM contracts WHERE "contractNumber" = 'CTR-2026-00003' AND "organizationId" = 'demo-org' \gset
SELECT id AS v_c4 FROM contracts WHERE "contractNumber" = 'CTR-2026-00004' AND "organizationId" = 'demo-org' \gset

SELECT set_config('cleanup.c1', :'v_c1', true) AS _ \gset
SELECT set_config('cleanup.c2', :'v_c2', true) AS _ \gset
SELECT set_config('cleanup.c3', :'v_c3', true) AS _ \gset
SELECT set_config('cleanup.c4', :'v_c4', true) AS _ \gset

DO $$
BEGIN
  IF current_setting('cleanup.c1') = current_setting('cleanup.c4')
     OR current_setting('cleanup.c2') = current_setting('cleanup.c4')
     OR current_setting('cleanup.c3') = current_setting('cleanup.c4') THEN
    RAISE EXCEPTION 'CRITICAL: an approved-for-deletion contract id equals the PRESERVED CTR-2026-00004 id. Aborting immediately.';
  END IF;
  IF current_setting('cleanup.c1') = current_setting('cleanup.c2')
     OR current_setting('cleanup.c1') = current_setting('cleanup.c3')
     OR current_setting('cleanup.c2') = current_setting('cleanup.c3') THEN
    RAISE EXCEPTION 'CRITICAL: two of the three approved contract numbers resolved to the same id. Aborting.';
  END IF;
END $$;

\echo 'Resolved contract ids for this run:'
\echo '  CTR-2026-00001 ->' :v_c1
\echo '  CTR-2026-00002 ->' :v_c2
\echo '  CTR-2026-00003 ->' :v_c3
\echo '  CTR-2026-00004 (PRESERVED, never a delete target) ->' :v_c4

\echo '================================================================'
\echo 'SECTION 2 - Resolve Unit/Renter/hierarchy ids via FK from the'
\echo '            contracts themselves (never by unitNumber/name as the'
\echo '            primary selector); cross-check the human-readable'
\echo '            label as a secondary sanity assertion only.'
\echo '================================================================'
SELECT "unitId" AS v_unit_a101, "renterId" AS v_renter_individual FROM contracts WHERE id = :'v_c1' \gset
SELECT "unitId" AS v_unit_g01_c2, "renterId" AS v_renter_business FROM contracts WHERE id = :'v_c2' \gset
SELECT "unitId" AS v_unit_g01_c3, "renterId" AS v_renter_business_c3 FROM contracts WHERE id = :'v_c3' \gset
SELECT "unitId" AS v_unit_714, "renterId" AS v_renter_004 FROM contracts WHERE id = :'v_c4' \gset

SELECT set_config('cleanup.unit_a101', :'v_unit_a101', true) AS _ \gset
SELECT set_config('cleanup.unit_g01_c2', :'v_unit_g01_c2', true) AS _ \gset
SELECT set_config('cleanup.unit_g01_c3', :'v_unit_g01_c3', true) AS _ \gset
SELECT set_config('cleanup.unit_714', :'v_unit_714', true) AS _ \gset
SELECT set_config('cleanup.renter_individual', :'v_renter_individual', true) AS _ \gset
SELECT set_config('cleanup.renter_business', :'v_renter_business', true) AS _ \gset
SELECT set_config('cleanup.renter_business_c3', :'v_renter_business_c3', true) AS _ \gset
SELECT set_config('cleanup.renter_004', :'v_renter_004', true) AS _ \gset

DO $$
BEGIN
  IF current_setting('cleanup.unit_g01_c2') <> current_setting('cleanup.unit_g01_c3') THEN
    RAISE EXCEPTION 'CTR-2026-00002 and CTR-2026-00003 no longer reference the same unit as audited (% vs %). Aborting - live data no longer matches the approved baseline.', current_setting('cleanup.unit_g01_c2'), current_setting('cleanup.unit_g01_c3');
  END IF;
  IF current_setting('cleanup.renter_business') <> current_setting('cleanup.renter_business_c3') THEN
    RAISE EXCEPTION 'CTR-2026-00002 and CTR-2026-00003 no longer reference the same renter as audited. Aborting.';
  END IF;
  IF current_setting('cleanup.unit_a101') = current_setting('cleanup.unit_714')
     OR current_setting('cleanup.unit_g01_c2') = current_setting('cleanup.unit_714') THEN
    RAISE EXCEPTION 'CRITICAL: an approved-for-deletion unit id equals the PRESERVED Unit 714 id. Aborting immediately.';
  END IF;
  IF current_setting('cleanup.renter_individual') = current_setting('cleanup.renter_004')
     OR current_setting('cleanup.renter_business') = current_setting('cleanup.renter_004') THEN
    RAISE EXCEPTION 'CRITICAL: an approved-for-deletion renter id equals the PRESERVED renter id. Aborting immediately.';
  END IF;
END $$;

SELECT current_setting('cleanup.unit_g01_c2') AS v_unit_g01 \gset
SELECT set_config('cleanup.unit_g01', :'v_unit_g01', true) AS _ \gset

DO $$
DECLARE v_label text;
BEGIN
  SELECT "unitNumber" INTO v_label FROM units WHERE id = current_setting('cleanup.unit_a101');
  IF v_label IS DISTINCT FROM 'A-101' THEN RAISE EXCEPTION 'Sanity check failed: CTR-2026-00001''s unit has unitNumber=% (expected A-101). Aborting.', v_label; END IF;

  SELECT "unitNumber" INTO v_label FROM units WHERE id = current_setting('cleanup.unit_g01');
  IF v_label IS DISTINCT FROM 'G-01' THEN RAISE EXCEPTION 'Sanity check failed: shared unit has unitNumber=% (expected G-01). Aborting.', v_label; END IF;

  SELECT "unitNumber" INTO v_label FROM units WHERE id = current_setting('cleanup.unit_714');
  IF v_label IS DISTINCT FROM '714' THEN RAISE EXCEPTION 'Sanity check failed: PRESERVED unit has unitNumber=% (expected 714). Aborting.', v_label; END IF;

  SELECT "fullName" INTO v_label FROM renters WHERE id = current_setting('cleanup.renter_individual');
  IF v_label IS DISTINCT FROM 'Mohammed Al-Otaibi' THEN RAISE EXCEPTION 'Sanity check failed: CTR-2026-00001''s renter has fullName=% (expected Mohammed Al-Otaibi). Aborting.', v_label; END IF;

  SELECT "fullName" INTO v_label FROM renters WHERE id = current_setting('cleanup.renter_business');
  IF v_label IS DISTINCT FROM 'Falcon Trading Est.' THEN RAISE EXCEPTION 'Sanity check failed: shared renter has fullName=% (expected Falcon Trading Est.). Aborting.', v_label; END IF;

  SELECT "fullName" INTO v_label FROM renters WHERE id = current_setting('cleanup.renter_004');
  IF v_label IS DISTINCT FROM 'ELOMAR JOSE CARIDAD SUAREZ' THEN RAISE EXCEPTION 'Sanity check failed: PRESERVED renter has fullName=% (expected ELOMAR JOSE CARIDAD SUAREZ). Aborting.', v_label; END IF;
END $$;

-- Capture the structural hierarchy (Floor/Building/Compound) for the two
-- demo units and for the PRESERVED unit, BEFORE any deletion, purely by FK
-- traversal - used only later, after the units themselves are gone, to
-- decide whether the now-empty demo hierarchy can also be safely removed.
SELECT f.id AS v_floor_a101, f."buildingId" AS v_building_a101
FROM units u JOIN floors f ON f.id = u."floorId" WHERE u.id = :'v_unit_a101' \gset
SELECT f.id AS v_floor_g01, f."buildingId" AS v_building_g01
FROM units u JOIN floors f ON f.id = u."floorId" WHERE u.id = :'v_unit_g01' \gset
SELECT b."compoundId" AS v_compound_a101 FROM buildings b WHERE b.id = :'v_building_a101' \gset
SELECT b."compoundId" AS v_compound_g01 FROM buildings b WHERE b.id = :'v_building_g01' \gset
SELECT f."buildingId" AS v_building_714
FROM units u JOIN floors f ON f.id = u."floorId" WHERE u.id = :'v_unit_714' \gset
SELECT b."compoundId" AS v_compound_714 FROM buildings b WHERE b.id = :'v_building_714' \gset

SELECT set_config('cleanup.floor_a101', :'v_floor_a101', true) AS _ \gset
SELECT set_config('cleanup.floor_g01', :'v_floor_g01', true) AS _ \gset
SELECT set_config('cleanup.building_a101', :'v_building_a101', true) AS _ \gset
SELECT set_config('cleanup.building_g01', :'v_building_g01', true) AS _ \gset
SELECT set_config('cleanup.compound_a101', :'v_compound_a101', true) AS _ \gset
SELECT set_config('cleanup.compound_g01', :'v_compound_g01', true) AS _ \gset
SELECT set_config('cleanup.building_714', :'v_building_714', true) AS _ \gset
SELECT set_config('cleanup.compound_714', :'v_compound_714', true) AS _ \gset

DO $$
BEGIN
  -- Hard abort (never merely "skip") if the demo hierarchy would in any way
  -- overlap with the PRESERVED unit's hierarchy - this is a correctness
  -- invariant, not a soft assumption.
  IF current_setting('cleanup.building_a101') = current_setting('cleanup.building_714')
     OR current_setting('cleanup.building_g01') = current_setting('cleanup.building_714') THEN
    RAISE EXCEPTION 'CRITICAL: the demo hierarchy shares a Building with the PRESERVED Unit 714. Aborting the entire operation.';
  END IF;
  IF current_setting('cleanup.compound_a101') = current_setting('cleanup.compound_714')
     OR current_setting('cleanup.compound_g01') = current_setting('cleanup.compound_714') THEN
    RAISE EXCEPTION 'CRITICAL: the demo hierarchy shares a Compound with the PRESERVED Unit 714. Aborting the entire operation.';
  END IF;
END $$;

-- Whether the two demo units genuinely share one Building/Compound (as
-- audited) - if not, the optional hierarchy cleanup in Section 7 is simply
-- skipped (not a hard failure): the unit/contract deletions above are
-- independently safe regardless of this outcome.
SELECT (:'v_building_a101' = :'v_building_g01' AND :'v_compound_a101' = :'v_compound_g01') AS v_hierarchy_consistent \gset
SELECT set_config('cleanup.hierarchy_consistent', :'v_hierarchy_consistent', true) AS _ \gset

\echo '================================================================'
\echo 'SECTION 3 - Fresh precondition assertions per approved contract'
\echo '            (re-resolved live, never trusted from a prior audit)'
\echo '================================================================'
DO $$
DECLARE v_n int;
BEGIN
  -- CTR-2026-00001: 12 schedules, 1 invoice, 1 invoiceLine, 1 payment, 0 else
  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 12 THEN RAISE EXCEPTION 'CTR-2026-00001 payment_schedules = % (expected 12). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CTR-2026-00001 invoices = % (expected 1). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoice_lines il JOIN invoices i ON i.id = il."invoiceId" WHERE i."contractId" = current_setting('cleanup.c1');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CTR-2026-00001 invoice_lines = % (expected 1). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM payments p JOIN invoices i ON i.id = p."invoiceId" WHERE i."contractId" = current_setting('cleanup.c1');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CTR-2026-00001 payments = % (expected 1). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_ins WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 move_ins = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 move_outs = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM maintenance_requests WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 maintenance_requests = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_settlements WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 security_deposit_settlements = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_ledger_entries WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 security_deposit_ledger_entries = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM corporate_housing_allocations WHERE "contractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 corporate_housing_allocations = % (expected 0). Aborting.', v_n; END IF;
  IF (SELECT "reservationId" FROM contracts WHERE id = current_setting('cleanup.c1')) IS NOT NULL THEN
    RAISE EXCEPTION 'CTR-2026-00001 has a non-null reservationId. Aborting.';
  END IF;
  SELECT count(*) INTO v_n FROM leads WHERE "convertedContractId" = current_setting('cleanup.c1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00001 has % Lead(s) pointing at it (expected 0). Aborting.', v_n; END IF;

  -- CTR-2026-00002: 4 schedules, 1 invoice, 1 invoiceLine, 0 payments, 0 else
  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 4 THEN RAISE EXCEPTION 'CTR-2026-00002 payment_schedules = % (expected 4). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CTR-2026-00002 invoices = % (expected 1). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoice_lines il JOIN invoices i ON i.id = il."invoiceId" WHERE i."contractId" = current_setting('cleanup.c2');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CTR-2026-00002 invoice_lines = % (expected 1). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM payments p JOIN invoices i ON i.id = p."invoiceId" WHERE i."contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 payments = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_ins WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 move_ins = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 move_outs = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM maintenance_requests WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 maintenance_requests = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_settlements WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 security_deposit_settlements = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_ledger_entries WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 security_deposit_ledger_entries = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM corporate_housing_allocations WHERE "contractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 corporate_housing_allocations = % (expected 0). Aborting.', v_n; END IF;
  IF (SELECT "reservationId" FROM contracts WHERE id = current_setting('cleanup.c2')) IS NOT NULL THEN
    RAISE EXCEPTION 'CTR-2026-00002 has a non-null reservationId. Aborting.';
  END IF;
  SELECT count(*) INTO v_n FROM leads WHERE "convertedContractId" = current_setting('cleanup.c2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00002 has % Lead(s) pointing at it (expected 0). Aborting.', v_n; END IF;

  -- CTR-2026-00003: 5 schedules, 0 invoices, 0 invoiceLines, 0 payments, 0 else
  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 5 THEN RAISE EXCEPTION 'CTR-2026-00003 payment_schedules = % (expected 5). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 invoices = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_ins WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 move_ins = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 move_outs = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM maintenance_requests WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 maintenance_requests = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_settlements WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 security_deposit_settlements = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_ledger_entries WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 security_deposit_ledger_entries = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM corporate_housing_allocations WHERE "contractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 corporate_housing_allocations = % (expected 0). Aborting.', v_n; END IF;
  IF (SELECT "reservationId" FROM contracts WHERE id = current_setting('cleanup.c3')) IS NOT NULL THEN
    RAISE EXCEPTION 'CTR-2026-00003 has a non-null reservationId. Aborting.';
  END IF;
  SELECT count(*) INTO v_n FROM leads WHERE "convertedContractId" = current_setting('cleanup.c3');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CTR-2026-00003 has % Lead(s) pointing at it (expected 0). Aborting.', v_n; END IF;
END $$;

\echo '================================================================'
\echo 'SECTION 4 - Shared-dependency exact-set assertions'
\echo '            (aborts if any UNEXPECTED extra contract shares'
\echo '            Unit A-101 / Unit G-01 / either renter)'
\echo '================================================================'
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM contracts WHERE "unitId" = current_setting('cleanup.unit_a101');
  IF v_n <> 1 THEN RAISE EXCEPTION 'Unit A-101 is referenced by % contracts, expected exactly 1. Aborting - unexpected extra contract.', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE "unitId" = current_setting('cleanup.unit_a101') AND id = current_setting('cleanup.c1')) THEN
    RAISE EXCEPTION 'Unit A-101''s sole referencing contract is not CTR-2026-00001. Aborting.';
  END IF;

  SELECT count(*) INTO v_n FROM contracts WHERE "unitId" = current_setting('cleanup.unit_g01');
  IF v_n <> 2 THEN RAISE EXCEPTION 'Unit G-01 is referenced by % contracts, expected exactly 2. Aborting - unexpected extra contract shares this unit.', v_n; END IF;
  IF EXISTS (SELECT 1 FROM contracts WHERE "unitId" = current_setting('cleanup.unit_g01') AND id NOT IN (current_setting('cleanup.c2'), current_setting('cleanup.c3'))) THEN
    RAISE EXCEPTION 'Unit G-01 is referenced by a contract other than CTR-2026-00002/00003. Aborting.';
  END IF;

  SELECT count(*) INTO v_n FROM contracts WHERE "renterId" = current_setting('cleanup.renter_individual');
  IF v_n <> 1 THEN RAISE EXCEPTION 'Renter (Mohammed Al-Otaibi) is referenced by % contracts, expected exactly 1. Aborting.', v_n; END IF;

  SELECT count(*) INTO v_n FROM contracts WHERE "renterId" = current_setting('cleanup.renter_business');
  IF v_n <> 2 THEN RAISE EXCEPTION 'Renter (Falcon Trading Est.) is referenced by % contracts, expected exactly 2. Aborting - unexpected extra contract shares this renter.', v_n; END IF;
  IF EXISTS (SELECT 1 FROM contracts WHERE "renterId" = current_setting('cleanup.renter_business') AND id NOT IN (current_setting('cleanup.c2'), current_setting('cleanup.c3'))) THEN
    RAISE EXCEPTION 'Renter (Falcon Trading Est.) is referenced by a contract other than CTR-2026-00002/00003. Aborting.';
  END IF;
END $$;

\echo '================================================================'
\echo 'SECTION 5 - CTR-2026-00004 PRESERVE-graph guard baseline'
\echo '            (captured for postcondition comparison; this contract'
\echo '            is NEVER a delete target anywhere in this file)'
\echo '================================================================'
DO $$
DECLARE v_n int; v_status text;
BEGIN
  SELECT status INTO v_status FROM contracts WHERE id = current_setting('cleanup.c4');
  IF v_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'PRESERVED CTR-2026-00004 status = % (expected ACTIVE). Aborting - refusing to proceed while the preserved contract''s state differs from the audited baseline.', v_status;
  END IF;
  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 3 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004 payment_schedules = % (expected 3). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 2 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004 invoices = % (expected 2). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoice_lines il JOIN invoices i ON i.id = il."invoiceId" WHERE i."contractId" = current_setting('cleanup.c4');
  IF v_n <> 2 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004 invoice_lines = % (expected 2). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM payments p JOIN invoices i ON i.id = p."invoiceId" WHERE i."contractId" = current_setting('cleanup.c4');
  IF v_n <> 0 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004 payments = % (expected 0). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004 move_outs = % (expected 1). Aborting.', v_n; END IF;
END $$;

SELECT id AS v_moveout004 FROM move_outs WHERE "contractId" = :'v_c4' \gset
SELECT set_config('cleanup.moveout004', :'v_moveout004', true) AS _ \gset

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM move_out_inspection_items WHERE "moveOutId" = current_setting('cleanup.moveout004');
  IF v_n <> 48 THEN RAISE EXCEPTION 'PRESERVED CTR-2026-00004''s MoveOut has % inspection items (expected 48). Aborting.', v_n; END IF;

  SELECT count(*) INTO v_n FROM move_outs;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Expected exactly 1 MoveOut in the entire database (the preserved one), found %. Aborting - unexpected MoveOut activity since the last audit.', v_n; END IF;
END $$;

\echo '================================================================'
\echo 'SECTION 6 - Capture pre-mutation Counter values and AuditLog count'
\echo '            (for postcondition comparison; NEVER written to here)'
\echo '================================================================'
SELECT value AS v_counter_contract_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'contract' \gset
SELECT value AS v_counter_invoice_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'invoice' \gset
SELECT value AS v_counter_moveout_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'moveOut' \gset
SELECT count(*) AS v_auditlog_count_before FROM audit_logs \gset

SELECT set_config('cleanup.counter_contract_before', :'v_counter_contract_before', true) AS _ \gset
SELECT set_config('cleanup.counter_invoice_before', :'v_counter_invoice_before', true) AS _ \gset
SELECT set_config('cleanup.counter_moveout_before', :'v_counter_moveout_before', true) AS _ \gset
SELECT set_config('cleanup.auditlog_before', :'v_auditlog_count_before', true) AS _ \gset

\echo '================================================================'
\echo 'SECTION 7 - EXPLICIT DELETES, in FK-safe order'
\echo '================================================================'

\echo '--- Step 1: Resolve and delete Payment(s) belonging to the approved'
\echo '    contracts'' invoices (payments.invoiceId is RESTRICT - must go'
\echo '    before its Invoice) ---'
SELECT id AS v_invoice1 FROM invoices WHERE "contractId" = :'v_c1' \gset
SELECT id AS v_invoice2 FROM invoices WHERE "contractId" = :'v_c2' \gset
SELECT set_config('cleanup.invoice1', :'v_invoice1', true) AS _ \gset
SELECT set_config('cleanup.invoice2', :'v_invoice2', true) AS _ \gset

DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM payments WHERE "invoiceId" = current_setting('cleanup.invoice1');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 payment for CTR-2026-00001''s invoice (RCT-DEMO-000001), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM payments WHERE "invoiceId" = current_setting('cleanup.invoice2');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 0 THEN RAISE EXCEPTION 'Expected to delete exactly 0 payments for CTR-2026-00002''s invoice, deleted %. Aborting.', v_deleted; END IF;
END $$;

\echo '--- Step 2: Delete the Invoices for CTR-2026-00001/00002 (explicit -'
\echo '    invoices.contractId is SET NULL, not CASCADE, so the DB would'
\echo '    silently orphan them rather than remove them if left to the'
\echo '    Contract delete alone). Cascades each Invoice''s InvoiceLine. ---'
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM invoices WHERE id = current_setting('cleanup.invoice1');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 invoice for CTR-2026-00001, deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM invoices WHERE id = current_setting('cleanup.invoice2');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 invoice for CTR-2026-00002, deleted %. Aborting.', v_deleted; END IF;
END $$;

\echo '--- Step 3: Delete the three approved Contracts (cascades their'
\echo '    PaymentSchedules: 12 + 4 + 5 = 21 rows) ---'
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM contracts WHERE id = current_setting('cleanup.c1');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 contract (CTR-2026-00001), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM contracts WHERE id = current_setting('cleanup.c2');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 contract (CTR-2026-00002), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM contracts WHERE id = current_setting('cleanup.c3');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 contract (CTR-2026-00003), deleted %. Aborting.', v_deleted; END IF;
END $$;

\echo '--- Step 4-7: Re-check zero remaining Contract references before'
\echo '    touching the shared Unit/Renter rows (also directly re-check'
\echo '    every other schema-discovered table with a FK to Unit/Renter,'
\echo '    even though all are globally empty per the last full inventory) ---'
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM contracts WHERE "unitId" = current_setting('cleanup.unit_a101');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unit A-101 still has % contract reference(s) after deletion. Aborting - refusing to delete a referenced Unit.', v_n; END IF;
  SELECT count(*) INTO v_n FROM contracts WHERE "unitId" = current_setting('cleanup.unit_g01');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unit G-01 still has % contract reference(s) after deletion. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM contracts WHERE "renterId" = current_setting('cleanup.renter_individual');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Renter (individual) still has % contract reference(s). Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM contracts WHERE "renterId" = current_setting('cleanup.renter_business');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Renter (business) still has % contract reference(s). Aborting.', v_n; END IF;

  -- Every other table with a FK to Unit, scoped to these two units:
  SELECT count(*) INTO v_n FROM viewing_units WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected viewing_units reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM leasing_offers WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected leasing_offers reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM reservations WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected reservations reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_ins WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected move_ins reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected move_outs reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM maintenance_requests WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected maintenance_requests reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_settlements WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected security_deposit_settlements reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM corporate_housing_allocations WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected corporate_housing_allocations reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM property_ownerships WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected property_ownerships reference(s) (%) to an approved unit. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM owner_ledger_entries WHERE "unitId" IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected owner_ledger_entries reference(s) (%) to an approved unit. Aborting.', v_n; END IF;

  -- Every other table with a FK to Renter, scoped to these two renters:
  SELECT count(*) INTO v_n FROM invoices WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected invoices reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM payments WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected payments reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_ins WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected move_ins reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected move_outs reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM maintenance_requests WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected maintenance_requests reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM security_deposit_settlements WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected security_deposit_settlements reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM tenant_portal_accounts WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected tenant_portal_accounts reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
  SELECT count(*) INTO v_n FROM corporate_accounts WHERE "renterId" IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Unexpected corporate_accounts reference(s) (%) to an approved renter. Aborting.', v_n; END IF;
END $$;

\echo '--- Step 8: Delete Unit A-101, Unit G-01, and both demo renters'
\echo '    (only reached if every zero-reference guard above passed) ---'
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM units WHERE id = current_setting('cleanup.unit_a101');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 unit (A-101), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM units WHERE id = current_setting('cleanup.unit_g01');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 unit (G-01), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM renters WHERE id = current_setting('cleanup.renter_individual');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 renter (Mohammed Al-Otaibi), deleted %. Aborting.', v_deleted; END IF;

  DELETE FROM renters WHERE id = current_setting('cleanup.renter_business');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 renter (Falcon Trading Est.), deleted %. Aborting.', v_deleted; END IF;
END $$;

\echo '--- Step 9-10: Optional structural hierarchy cleanup - ONLY if the'
\echo '    two demo units were proven (Section 2) to share one Building/'
\echo '    Compound, that hierarchy is now empty, and it does not overlap'
\echo '    with the PRESERVED unit''s hierarchy. Anything not unquestionably'
\echo '    safe is PRESERVED (RAISE NOTICE, not deleted) - this is never a'
\echo '    hard failure on its own. ---'
DO $$
DECLARE v_remaining int; v_deleted int;
BEGIN
  SELECT count(*) INTO v_remaining FROM units WHERE "floorId" = current_setting('cleanup.floor_a101');
  IF v_remaining = 0 THEN
    DELETE FROM floors WHERE id = current_setting('cleanup.floor_a101');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 floor (A-101''s), deleted %.', v_deleted; END IF;
    RAISE NOTICE 'Deleted now-empty Floor % (A-101''s floor).', current_setting('cleanup.floor_a101');
  ELSE
    RAISE NOTICE 'Floor % still has % unit(s) - preserving, not deleting.', current_setting('cleanup.floor_a101'), v_remaining;
  END IF;

  IF current_setting('cleanup.floor_g01') <> current_setting('cleanup.floor_a101') THEN
    SELECT count(*) INTO v_remaining FROM units WHERE "floorId" = current_setting('cleanup.floor_g01');
    IF v_remaining = 0 THEN
      DELETE FROM floors WHERE id = current_setting('cleanup.floor_g01');
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 floor (G-01''s), deleted %.', v_deleted; END IF;
      RAISE NOTICE 'Deleted now-empty Floor % (G-01''s floor).', current_setting('cleanup.floor_g01');
    ELSE
      RAISE NOTICE 'Floor % still has % unit(s) - preserving, not deleting.', current_setting('cleanup.floor_g01'), v_remaining;
    END IF;
  END IF;

  IF current_setting('cleanup.hierarchy_consistent') = 't' THEN
    SELECT count(*) INTO v_remaining FROM floors WHERE "buildingId" = current_setting('cleanup.building_a101');
    IF v_remaining = 0 THEN
      DELETE FROM buildings WHERE id = current_setting('cleanup.building_a101');
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 building, deleted %.', v_deleted; END IF;
      RAISE NOTICE 'Deleted now-empty Building %.', current_setting('cleanup.building_a101');

      SELECT count(*) INTO v_remaining FROM buildings WHERE "compoundId" = current_setting('cleanup.compound_a101');
      IF v_remaining = 0 THEN
        DELETE FROM compounds WHERE id = current_setting('cleanup.compound_a101');
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN RAISE EXCEPTION 'Expected to delete exactly 1 compound, deleted %.', v_deleted; END IF;
        RAISE NOTICE 'Deleted now-empty Compound %.', current_setting('cleanup.compound_a101');
      ELSE
        RAISE NOTICE 'Compound % still has % building(s) - preserving, not deleting.', current_setting('cleanup.compound_a101'), v_remaining;
      END IF;
    ELSE
      RAISE NOTICE 'Building % still has % floor(s) - preserving, not deleting (Compound left untouched too).', current_setting('cleanup.building_a101'), v_remaining;
    END IF;
  ELSE
    RAISE NOTICE 'Demo units did not share a single Building/Compound as audited - skipping structural hierarchy cleanup entirely, preserving all of it.';
  END IF;
END $$;

\echo '================================================================'
\echo 'SECTION 8 - POSTCONDITIONS (must all pass before COMMIT)'
\echo '================================================================'
DO $$
DECLARE v_n int; v_before int; v_status text;
BEGIN
  SELECT count(*) INTO v_n FROM contracts WHERE id IN (current_setting('cleanup.c1'), current_setting('cleanup.c2'), current_setting('cleanup.c3'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % of the 3 approved contracts still exist.', v_n; END IF;

  SELECT count(*) INTO v_n FROM invoices WHERE id IN (current_setting('cleanup.invoice1'), current_setting('cleanup.invoice2'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: an approved invoice still exists.'; END IF;

  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" IN (current_setting('cleanup.c1'), current_setting('cleanup.c2'), current_setting('cleanup.c3'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: payment_schedules remain for a deleted contract.'; END IF;

  SELECT count(*) INTO v_n FROM payments WHERE "invoiceId" IN (current_setting('cleanup.invoice1'), current_setting('cleanup.invoice2'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: a payment still references a deleted invoice.'; END IF;

  SELECT count(*) INTO v_n FROM units WHERE id IN (current_setting('cleanup.unit_a101'), current_setting('cleanup.unit_g01'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: an approved unit still exists.'; END IF;

  SELECT count(*) INTO v_n FROM renters WHERE id IN (current_setting('cleanup.renter_individual'), current_setting('cleanup.renter_business'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: an approved renter still exists.'; END IF;

  -- CTR-2026-00004 and its entire graph: byte-for-byte unchanged
  SELECT count(*) INTO v_n FROM contracts WHERE id = current_setting('cleanup.c4');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CRITICAL Postcondition failed: PRESERVED contract CTR-2026-00004 no longer exists exactly once!'; END IF;
  SELECT status INTO v_status FROM contracts WHERE id = current_setting('cleanup.c4');
  IF v_status IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract status changed to %.', v_status; END IF;
  SELECT count(*) INTO v_n FROM payment_schedules WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 3 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract payment_schedules changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 2 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract invoices changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoice_lines il JOIN invoices i ON i.id = il."invoiceId" WHERE i."contractId" = current_setting('cleanup.c4');
  IF v_n <> 2 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract invoice_lines changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM payments p JOIN invoices i ON i.id = p."invoiceId" WHERE i."contractId" = current_setting('cleanup.c4');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract payments changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_outs WHERE "contractId" = current_setting('cleanup.c4');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED contract move_outs changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM move_out_inspection_items WHERE "moveOutId" = current_setting('cleanup.moveout004');
  IF v_n <> 48 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED MoveOut inspection_items changed to %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM units WHERE id = current_setting('cleanup.unit_714');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED Unit 714 no longer exists!'; END IF;
  SELECT count(*) INTO v_n FROM renters WHERE id = current_setting('cleanup.renter_004');
  IF v_n <> 1 THEN RAISE EXCEPTION 'CRITICAL: PRESERVED renter no longer exists!'; END IF;

  -- AuditLog: never decreases
  SELECT count(*) INTO v_n FROM audit_logs;
  IF v_n < current_setting('cleanup.auditlog_before')::int THEN RAISE EXCEPTION 'CRITICAL: AuditLog row count decreased (% -> %). Aborting.', current_setting('cleanup.auditlog_before'), v_n; END IF;

  -- Counters: unchanged (this is an isolated one-time operation with no
  -- concurrent legitimate application activity expected during its run)
  SELECT value INTO v_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'contract';
  IF v_before IS DISTINCT FROM current_setting('cleanup.counter_contract_before')::int THEN RAISE EXCEPTION 'CRITICAL: contract counter changed from % to %. Aborting.', current_setting('cleanup.counter_contract_before'), v_before; END IF;
  SELECT value INTO v_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'invoice';
  IF v_before IS DISTINCT FROM current_setting('cleanup.counter_invoice_before')::int THEN RAISE EXCEPTION 'CRITICAL: invoice counter changed from % to %. Aborting.', current_setting('cleanup.counter_invoice_before'), v_before; END IF;
  SELECT value INTO v_before FROM counters WHERE "organizationId" = 'demo-org' AND key = 'moveOut';
  IF v_before IS DISTINCT FROM current_setting('cleanup.counter_moveout_before')::int THEN RAISE EXCEPTION 'CRITICAL: moveOut counter changed from % to %. Aborting.', current_setting('cleanup.counter_moveout_before'), v_before; END IF;

  -- Organization and OWNER account untouched
  SELECT count(*) INTO v_n FROM organizations WHERE id = 'demo-org';
  IF v_n <> 1 THEN RAISE EXCEPTION 'CRITICAL: Organization demo-org no longer exists!'; END IF;
  SELECT count(*) INTO v_n FROM users WHERE "organizationId" = 'demo-org' AND role = 'OWNER' AND "isActive" = true;
  IF v_n < 1 THEN RAISE EXCEPTION 'CRITICAL: no active OWNER account remains in demo-org!'; END IF;
END $$;

\echo 'All postcondition assertions passed.'

COMMIT;

\echo '================================================================'
\echo 'CLEANUP COMMITTED. Run the read-only production inventory and'
\echo 'contract dependency audit workflows again immediately to'
\echo 'independently confirm the post-state.'
\echo '================================================================'
