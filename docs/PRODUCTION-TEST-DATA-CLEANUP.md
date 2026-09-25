# Production Test/UAT Data Cleanup (one-time operation)

**This is not a reusable cleanup tool.** It documents one specific, approved,
one-time production data-removal operation for the Pro Core / GULF ADDRESS
Real Estate Investment Company (`demo-org`) Neon production database. It
exists so the operation is fully reviewable, auditable, and reproducible in
concept - not so it can be run again for a future, different cleanup.

## 1. Purpose

Production (`demo-org`) originated from this codebase's own demo seed script
and was subsequently repurposed for real operation. A read-only production
audit (the "Production Contract Dependency Audit (read-only)" workflow)
established that of the four Contracts present, three are approved by the
business as disposable test/UAT data and one is real, active, and must never
be touched. This operation removes exactly the approved three and their
exclusively-owned dependencies, and nothing else.

## 2. Exact approved contracts

| Contract | Classification | Basis |
|---|---|---|
| CTR-2026-00001 | Approved for deletion | Confirmed seed contract/unit/renter (demo-contract-res / demo-unit-res / demo-renter-individual) |
| CTR-2026-00002 | Approved for deletion | Confirmed seed contract/unit/renter (demo-contract-com / demo-unit-com / demo-renter-business) |
| CTR-2026-00003 | Approved for deletion | Not seed-originated, but explicit business approval given after review; shares Unit G-01 and renter "Falcon Trading Est." with CTR-2026-00002 |
| **CTR-2026-00004** | **PRESERVED - never touched** | Real, active contract (Le Roya Resort, Unit 714, renter ELOMAR JOSE CARIDAD SUAREZ); explicit standing instruction to never delete it or anything reachable from it |

## 3. Exact preservation boundary

Never touched by this operation, under any circumstance:
- CTR-2026-00004 and everything reachable from it: Unit 714, its renter, its
  Compound/Building/Floor, its 3 PaymentSchedules, its 2 Invoices (one
  OVERDUE rent invoice, one OVERDUE commission invoice) and their 2
  InvoiceLines, its 1 MoveOut and 48 MoveOutInspectionItem rows.
- Organization `demo-org` itself.
- The sole internal OWNER/staff account.
- Every AuditLog row (13 at last audit, and growing).
- Every Counter row and its value (`contract`, `invoice`, `moveOut`).
- `_prisma_migrations` and the Prisma schema/migration history.
- Everything else in the database not explicitly named above.

## 4. Why Invoice deletion is explicit, not left to cascade

`invoices.contractId` has `ON DELETE SET NULL` (verified directly against
`prisma/migrations/20260918233019_init/migration.sql`, not inferred from
`schema.prisma`'s relation attributes). Deleting a Contract would **not**
remove its Invoices - it would silently null out their `contractId`,
leaving orphaned financial records (and their cascaded InvoiceLines, and
anything a Payment `RESTRICT`s) behind, disconnected from any contract.
The cleanup SQL therefore deletes each approved contract's Payment(s) (if
any - `payments.invoiceId` is `RESTRICT`), then its Invoice(s) explicitly,
*before* deleting the Contract itself.

## 5. Why Counters are never touched

`nextCounterValue()` (`src/lib/numbering.ts` / `src/lib/contract-schedule.ts`
etc.) only ever `upsert`s with `value: { increment: 1 }` - no code path in
this codebase resets or decrements a Counter. Contract/invoice/receipt
numbers already issued (including to the contracts being deleted here) must
never be capable of being reissued to a different real record later. The
cleanup SQL contains zero `INSERT`/`UPDATE`/`DELETE` targeting the
`counters` table, captures each relevant counter's value *before* deleting
anything, and asserts (as a hard postcondition, before `COMMIT`) that every
captured value is still exactly the same afterward.

## 6. Why AuditLog is preserved unconditionally

`AuditLog` is this codebase's immutable compliance trail
(`docs/AUDIT-AND-FINANCIAL-CONTROLS.md`) and is never purged by application
code. Some existing AuditLog rows reference entities (an Invoice, the
MoveOut) that this operation's own investigation surfaced - deleting the
business rows they reference does not, and must not, remove the audit
trail that recorded them. The cleanup SQL never deletes from `audit_logs`
and asserts, as a hard postcondition, that its row count has not decreased.

## 7. Rollback behavior

The entire cleanup runs inside one explicit `BEGIN; ... COMMIT;`
transaction. Every step - id resolution, precondition assertions,
shared-dependency checks, the preserved-contract guard, every `DELETE`, and
every postcondition - is inside that same transaction. Any single
`RAISE EXCEPTION` (every assertion in the script is one) aborts the current
Postgres transaction; combined with `\set ON_ERROR_STOP on`, `psql` then
exits immediately without ever reaching `COMMIT`, and the still-open
transaction is discarded when the connection closes. There is no partial-
commit path anywhere in this script - it either fully succeeds and commits,
or it changes nothing.

## 8. Execution prerequisites (before this is ever run)

1. A current Neon backup/restore point exists (the `pre-migration-2026-09-25`
   branch, or a fresher equivalent) and is not deleted until post-execution
   verification is complete.
2. The read-only "Production Contract Dependency Audit (read-only)" workflow
   is re-run **immediately before** execution, and its output is confirmed
   to still match the baseline this script's preconditions expect (12/4/5/3
   PaymentSchedules; 1/1/0/2 Invoices; 1/1/0/2 InvoiceLines; 1/0/0/0
   Payments; CTR-2026-00004 ACTIVE with its 1 MoveOut/48 inspection items
   unchanged). If production has materially changed since the last audit,
   **do not run this script** - it is written against a specific baseline,
   not a self-adapting tool, and its own preconditions will abort it if the
   baseline no longer matches, but re-confirming beforehand avoids a wasted,
   albeit safe, no-op run.
3. Every reviewer of this document and the SQL/workflow files has confirmed
   they understand this is a one-time operation for this exact dataset, not
   a general-purpose tool to be re-run later without re-deriving a new,
   equally rigorous baseline.
4. Explicit, recorded human approval to execute (this document accompanies
   that approval record; it is not itself the approval).

## 9. Post-execution verification procedure

Immediately after a successful run:
1. Re-run the "Production Data Inventory (read-only)" and "Production
   Contract Dependency Audit (read-only)" workflows and confirm: exactly one
   Contract remains (CTR-2026-00004, ACTIVE, unchanged in every field
   audited); Units/Renters count decreased by exactly the expected amount;
   Counters (`contract`, `invoice`, `moveOut`) are unchanged; AuditLog count
   is unchanged or higher, never lower.
2. `SELECT` `_prisma_migrations` and confirm no row was added, changed, or
   removed.
3. Smoke-test the live application: internal staff login still works,
   CTR-2026-00004's contract page still loads correctly with its 2 invoices,
   1 MoveOut, and 48 inspection items intact.
4. Only after all of the above pass, consider retiring the pre-execution
   restore point per the organization's normal retention policy - not
   immediately.

## 10. Restore-point requirement

Do not execute this operation without a verified, current Neon
backup/branch restore point already in place (see §8.1). If anything in §9
fails to verify as expected after execution, restore from that point rather
than attempting to hand-write a corrective SQL script under time pressure.

## 11. Validation performed before this operation was ever proposed for production

The SQL was validated end-to-end against a disposable, local-only Postgres
fixture database (never the shared dev/test databases, never production),
seeded to mirror the exact production scenario (4 contracts, the same
schedule/invoice/payment/MoveOut counts, the same shared-unit/shared-renter
relationship between CTR-2026-00002/00003, a separate preserved hierarchy
for CTR-2026-00004). Confirmed:

- **Happy path**: commits successfully; exactly the 3 approved contracts,
  their 2 invoices/lines/1 payment, and their exclusively-owned Unit
  A-101/Unit G-01/both renters are removed; the now-empty demo
  Floor/Building/Compound are also removed; CTR-2026-00004's entire graph
  (contract, unit, renter, 3 schedules, 2 invoices, 2 lines, 1 MoveOut, 48
  inspection items) is verified byte-for-byte unchanged; Counters
  (`contract`=4, `invoice`=4, `moveOut`=1) unchanged; AuditLog count (13)
  unchanged.
- **Missing contract** (a contract number renamed away): aborts at the
  resolution step, zero changes committed.
- **Wrong row count** (one PaymentSchedule removed from CTR-2026-00001
  beforehand): aborts at the precondition-assertion step, zero changes
  committed.
- **Extra contract unexpectedly sharing Unit G-01**: aborts at the
  shared-dependency exact-set assertion, zero changes committed.
- **Extra contract unexpectedly sharing renter "Falcon Trading Est."**:
  aborts at the same assertion (renter branch), zero changes committed.
- **Preserved contract's state unexpectedly different** (CTR-2026-00004
  manually set to TERMINATED beforehand): aborts at the preserve-graph
  guard baseline, before touching anything - confirmed CTR-2026-00001 (which
  the happy path successfully deletes) was left completely untouched.
- **Payment-before-Invoice ordering** and **no orphaned Invoice from the
  SET NULL behavior**: proven correct by the happy-path run itself (the
  script's own postconditions directly assert zero remaining payments/
  invoices for the deleted contracts).
- **Atomicity**: every failure scenario above left the fixture in its exact
  pre-run state (verified by re-querying row counts after each aborted
  attempt) - there is no scenario in which a partial set of deletes commits.

No validation was ever pointed at production or at this repository's shared
dev/test databases.
