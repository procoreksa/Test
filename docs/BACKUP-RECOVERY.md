# Backup & Recovery Readiness

Written during the production-readiness hardening pass. This is a
**requirements and process document**, not backup software - nothing in
this codebase implements backups itself; that's correctly the
responsibility of the managed Postgres provider plus a documented
operational process, not application code.

## 1. What must be backed up

Postgres is no longer the only place this application writes durable data.
Document Management (`docs/DOCUMENT-MANAGEMENT.md`) added a real, separate
datastore: uploaded file bytes, addressed by `DocumentVersion.storageKey`,
live behind a storage adapter - either the `LOCAL_DEV` filesystem adapter
(dev-only, not covered by any backup process, not durable) or, once
configured, an `S3_COMPATIBLE` object store. **A database-only backup is no
longer sufficient to restore this application's data**: restoring only the
Postgres dump after a real incident would bring back every `Document`/
`DocumentVersion` row (metadata, checksums, storage keys) with **no actual
file bytes behind any of them** - every download would 404 against a
missing object (the same safe, non-leaking failure mode
`docs/DOCUMENT-MANAGEMENT.md` §28 documents for this exact scenario, but as
a mass-incident instead of an isolated integrity problem). Object storage
providers back up differently than a relational database - "backups" for
one usually means versioning/replication settings on the bucket, not a
pg_dump-shaped process - and that story is not yet built or documented
further than this paragraph, since no real object-storage account is
configured in this environment (`docs/DOCUMENT-MANAGEMENT.md` §20/40).
**Before this application holds real user documents in production**,
whoever configures the `S3_COMPATIBLE` adapter must also stand up that
object store's own backup/versioning story and keep it restorable in
lockstep with the database backup below - a Postgres restore and an
object-storage restore must be treated as one recovery unit, not two
independent ones. Within Postgres itself, every table still matters - there
is no "safe to lose" table in this schema: `AuditLog` is the immutable
compliance trail, `Contract`/`Invoice`/`Payment`/`OwnerLedgerEntry` are the
financial system of record, and everything else (CRM, property hierarchy,
Move-In, Document metadata) feeds those. Automation & Scheduled Jobs
(`docs/AUTOMATION-SCHEDULED-JOBS.md`) added five more tables, covered by the
same backup process with no new infrastructure required - `CommunicationOutboxEvent`
and `AutomationSettings` matter for business continuity (losing either
means a durable notification intent, or an organization's reminder
configuration, is gone), while `AutomationJobAttempt` and
`AutomationSchedulerRun` are pure operational/observability history - safe
to lose without any business-data consequence, but still restored
automatically by the same whole-database backup, never excluded
separately.

## 2. Automated backups

**Requirement: continuous, automated, provider-managed backups - never a
manual `pg_dump` run by a human as the primary strategy.** Concretely,
whichever managed Postgres is used in production (Supabase, Render's own
managed Postgres, RDS, etc.) must have its automated backup feature
enabled from day one of handling real tenant data, not added later. At
minimum:

- Daily full backups, retained for at least the provider's default window
  (commonly 7 days on entry-level managed-Postgres tiers).
- If the hosting plan supports it, **point-in-time recovery (PITR)** via
  continuous WAL archiving - this is the difference between "restore to
  last night" and "restore to 2 minutes before the bad migration ran."
  Treat PITR as a plan-selection decision to make deliberately (many
  providers gate it behind a paid tier), not an assumption.

This document deliberately does not name one provider's specific
retention numbers or pricing as a hard requirement (per the brief's own
"without hardcoding plan-specific marketing assumptions" instruction) -
the requirement is the *capability* (automated + point-in-time, if
available), whichever provider delivers it.

## 3. Retention

Recommend a tiered retention policy once volume justifies it: recent
daily backups (7-14 days) at full granularity, weekly backups retained
for a longer window (e.g. 3 months), and a monthly backup retained for a
compliance-driven period appropriate to Saudi financial record-keeping
requirements (confirm the exact statutory retention period with the
organization's own compliance/legal function - this codebase's own
`AuditLog` and financial tables are designed to never be purged by the
application itself, so the backup retention policy is a second, redundant
layer of that same "never lose financial history" principle, not the
only one).

## 4. Pre-migration backups

**Every production schema migration (`prisma migrate deploy`) must be
preceded by a fresh, verified backup**, taken immediately before the
migration runs, kept independently of the regular rolling retention
schedule until the migration is confirmed healthy in production (a
reasonable minimum: 24-48 hours post-deploy). This codebase's own
migration discipline (every migration in this repository's history has
been additive-only - see `docs/*.md`'s own "purely additive" migration
comments throughout) makes a bad migration unlikely to destroy data, but
"unlikely" is not "impossible," and a pre-migration backup is the cheap
insurance against the one migration that turns out not to be as additive
as intended.

## 5. Restore testing

**An untested backup is not a backup.** Recommend a quarterly (at
minimum) restore drill: take the most recent automated backup, restore it
into a throwaway database instance, and verify the application can
actually boot against it (run `npx prisma migrate deploy` against the
restored copy and confirm no drift, then spot-check a handful of
real-looking records). This is the single most commonly-skipped step in
backup strategy and the one most likely to matter the day it's actually
needed.

## 6. Recovery process (documented runbook, to be exercised in the drill above)

1. Identify the target restore point (latest backup, or a specific PITR
   timestamp if the incident has a known "bad" moment).
2. Provision a new Postgres instance from that backup/point-in-time
   (provider-specific mechanism).
3. Update `DATABASE_URL`/`DIRECT_URL` to point at the restored instance
   (see `docs/PRODUCTION-DEPLOYMENT.md` §"Environment variables" for the
   pooled-vs-direct distinction that matters here).
4. Run `npx prisma migrate deploy` against the restored instance to
   confirm it's at the expected schema version (it should already be, if
   the backup post-dates the last migration - this step is a
   verification, not an expected no-op-turned-op).
5. Smoke-test the application against the restored database (login,
   dashboard load, one write) before cutting production traffic over.
6. Cut the application's environment variable(s) over to the restored
   instance and redeploy/restart the app.
7. Post-incident: reconcile any writes that happened between the restore
   point and the incident (this is where a shorter PITR granularity
   directly reduces the size of this reconciliation problem - another
   reason to prefer PITR over daily-only backups where the plan
   supports it).

## 7. Restore drill - actually executed (Prompt 23, Critical Rule 8)

"A backup procedure alone is insufficient" - so, per Critical Rule 8, both a
database restore and an object-storage restore were actually performed
during this hardening pass, against isolated throwaway resources (never
the shared dev/test databases). Both passed with full integrity
verification, not just "the command exited 0."

### 8a. Database restore drill (real PostgreSQL, `pg_dump`/`pg_restore`)

1. Created an isolated, disposable source database
   (`rental_saas_restore_drill_src`) and ran `prisma migrate deploy`
   against it from empty - **this step failed on the first attempt**, and
   is itself a real finding: see §9 below, "Migration-ordering bug found
   and fixed by this drill."
2. Once the corrected migration history applied cleanly, inserted a known
   fixture row (`organizations` row `id = 'drill-org-1'`).
3. Took a real backup: `pg_dump -Fc` to a `.dump` file (338,915 bytes).
4. Simulated an incident: `DELETE FROM organizations WHERE id =
   'drill-org-1'` against the source database - confirmed the row was
   gone (`count = 0`).
5. Created a second, separate isolated database
   (`rental_saas_restore_drill_restored`) and restored the backup into it
   with `pg_restore --no-owner --no-privileges`.
6. **Verified, not assumed:**
   - The fixture row exists again in the restored database with its exact
     original values (`id`, `name`, `vatNumber`).
   - Table count matches between source and restored databases (71 = 71).
   - Foreign-key constraints exist and are intact in the restored database
     (spot-checked `automation_job_attempts_jobId_fkey` and others).
   - `prisma migrate status` against the restored database reports
     **"Database schema is up to date!"** - the actual Prisma tooling this
     application depends on recognizes the restored database as
     healthy, not just `psql` queries run by hand.
7. Cleaned up both throwaway databases afterward - the drill never touched
   the real dev/test databases' data.

### 8b. Object storage restore drill (real S3-compatible adapter, local test server)

No real AWS/R2 account exists in this environment (per §"What must be
backed up" above and `docs/DOCUMENT-MANAGEMENT.md`), so this drill ran
against a local, in-process S3-compatible test server (`s3rver`) - but
exercised the actual, real `S3CompatibleStorageProvider` class
(`src/lib/documents/providers/s3-compatible.ts`) that production traffic
uses, not a mock of it:

1. `putObject()` a real fixture PDF (539 bytes) and computed its SHA-256
   checksum.
2. "Backed up" the object by reading it back and writing a second copy to
   a separate `backup/...` key (simulating the versioning/cross-region
   copy a real bucket's backup policy would maintain - see §"Object
   storage backup documentation" for the real requirement).
3. Simulated an incident: `deleteObject()` the original key, confirmed
   `exists()` now returns `false`.
4. Restored: read the backup copy and `putObject()` it back to the
   original key.
5. **Verified, not assumed:** re-read the restored object and computed its
   SHA-256 checksum - it matched the original exactly
   (`a78d7377e33aecc9442102b344653c3feacc9442201d166c1d853088283e8703`),
   and a byte-for-byte `Buffer.equals()` comparison also passed.

**What this does and doesn't prove:** the adapter's put/get/delete/exists
logic, checksum integrity through a full backup-delete-restore cycle, and
the real AWS SDK v3 wire protocol against an S3-compatible HTTP endpoint
are all genuinely exercised. What it does NOT prove: behavior against a
real AWS/R2/MinIO account's specific auth/IAM edge cases, or real
cross-region replication - those remain "implemented but not
live-verified against a real provider," to be confirmed once a real
object-storage account is provisioned.

## 8. Migration-ordering bug found and fixed by this drill

Attempting the restore drill's own first step - `prisma migrate deploy`
against a genuinely empty database - failed with `P3006: relation
"move_outs" does not exist`. This is `docs/TECHNICAL-DEBT.md`'s
previously-known item #8 (originally found only via `prisma migrate dev`'s
shadow-database rebuild), but the drill proved it is NOT merely a
dev-tooling inconvenience: it also breaks a genuine first-time production
database bootstrap via `prisma migrate deploy`, since the
`security_deposit_settlement` migration (originally timestamped
`20260923094528`) has a foreign key into `move_outs`, a table not created
until the later `move_out_management` migration (`20261105090000`).

**Fixed during this pass**, exactly as `docs/TECHNICAL-DEBT.md` item #8
already prescribed: the migration folder was renamed to
`20261105090001_security_deposit_settlement` (sorting immediately after
`move_out_management`, confirmed via `grep` that no migration in between
the two original timestamps ever references the `security_deposit_settlements`
table, so the reorder is safe). Verified twice:

- A fresh `prisma migrate deploy` against a new empty database now
  succeeds end-to-end (all 27 migrations apply cleanly - this is exactly
  what the drill's own first step needed, and now what a real first-time
  production deployment will experience).
- The two already-migrated databases in this environment (dev and test)
  were reconciled via the official, sanctioned `npx prisma migrate
  resolve --applied 20261105090001_security_deposit_settlement` command
  (never a raw SQL edit of `_prisma_migrations`) - `prisma migrate status`
  now reports "Database schema is up to date!" on both.

This is a genuine production-readiness fix (Prompt 23's own "migration
safety review" step), not a business-logic change - no column, table,
constraint, or data was altered, only the chronological position of one
already-additive migration file.

## 9. What this document does not cover

Actual backup automation, cross-region replication, and disaster-recovery
failover across hosting regions are provider-configuration and
infrastructure-budget decisions made outside this codebase - this
document's job is to make sure whoever operates production has read this
list and made each decision deliberately, not to make the decisions for
them or to implement any of this in application code.
