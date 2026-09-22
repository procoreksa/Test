# Backup & Recovery Readiness

Written during the production-readiness hardening pass. This is a
**requirements and process document**, not backup software - nothing in
this codebase implements backups itself; that's correctly the
responsibility of the managed Postgres provider plus a documented
operational process, not application code.

## 1. What must be backed up

Everything lives in one Postgres database - there is no secondary
datastore yet (see `docs/STORAGE-ARCHITECTURE.md` for the future object-
storage addition, which will need its own, separate backup story once it
exists: object storage providers back up differently than a relational
database, and "backups" for it usually means versioning/replication
settings on the bucket, not a pg_dump-shaped process). Within Postgres,
every table matters - there is no "safe to lose" table in this schema:
`AuditLog` is the immutable compliance trail, `Contract`/`Invoice`/
`Payment`/`OwnerLedgerEntry` are the financial system of record, and
everything else (CRM, property hierarchy, Move-In) feeds those.

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

## 7. What this document does not cover

Actual backup automation, cross-region replication, and disaster-recovery
failover across hosting regions are provider-configuration and
infrastructure-budget decisions made outside this codebase - this
document's job is to make sure whoever operates production has read this
list and made each decision deliberately, not to make the decisions for
them or to implement any of this in application code.
