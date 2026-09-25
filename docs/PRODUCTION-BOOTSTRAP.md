# Production Bootstrap Procedure

Written during Prompt 25 (Production Deployment Preparation & Final
Go-Live Gate). This is a **planning document only** - no bootstrap
mechanism described here has been implemented yet, and none should be
until a real production target actually exists (see the "Not implemented
yet" note at the end).

## 1. What needs bootstrapping

Confirmed by direct code audit (`src/lib/seed-demo-data.ts`,
`src/app/api/admin/seed/route.ts`, and every `create*` action across
`src/lib/actions/`): **the only thing a brand-new, empty production
database needs before the application is usable is exactly one
`Organization` row and exactly one `User` row for that Organization with
`role: "OWNER"`.** Every other entity (Compounds, Units, Renters, staff
accounts, Tenant/Owner Portal accounts) is created through the UI once
that first OWNER can log in - this was verified end-to-end in Prompt 24
(the Staff Users admin surface, `/settings/users`, requires nothing but an
existing OWNER/ADMIN session).

There is deliberately **no self-service "create your organization" signup
flow anywhere in this codebase** - internal staff accounts are always
provisioned by an existing staff member (or, for the very first one, by
whoever runs this bootstrap procedure). This matches the existing
internal-provisioning model exactly; bootstrap does not introduce a new
pattern, it just performs the one step that model has no UI for yet
(creating the *first* account, when no OWNER exists to create it from the
UI).

## 2. What must NOT be used for this

- **`prisma/seed.ts` / `src/lib/seed-demo-data.ts`** - hardcodes a demo
  organization, a demo owner (`admin@demo-realestate.sa` /
  `Passw0rd!`), and a large tree of fabricated demo data (compounds,
  units, renters, contracts). This is test/demo tooling; running it
  against a real production database would create fake data and a
  publicly-known password. **Never run this against production.**
- **`POST /api/admin/seed`** - the HTTP wrapper around the same demo
  seeder. It already refuses to run in production unless
  `ALLOW_PRODUCTION_SEED="true"` is explicitly set (`src/app/api/admin/
  seed/route.ts`), and even then it would seed the same fabricated demo
  data, not a real customer's first organization. **This route should
  never be the bootstrap mechanism** - it exists for a different purpose
  (letting a staging/demo deployment self-seed) and Step 10's own
  instruction is explicit: "Do not create a public bootstrap HTTP
  endpoint."
- **Manual raw SQL `INSERT`** - would bypass `bcrypt` password hashing
  (the `User.passwordHash` column expects a bcrypt hash, never a plaintext
  password) and every schema-level default/constraint Prisma's client
  normally applies. Avoid unless every one of those is manually
  replicated - which is exactly what a small script (§3) does safely
  instead.

## 3. Proposed mechanism: a one-time, operator-run CLI script

**Proposed, not implemented.** The safest supported procedure is a small,
standalone Node/tsx script - the same execution shape as `prisma/seed.ts`
already uses (`tsx prisma/seed.ts` via `npm run db:seed`) - but with a
distinct name and distinct behavior, so it can never be confused with or
accidentally trigger the demo seeder:

```
prisma/bootstrap-production.ts   (proposed filename)
```

Design, matching this codebase's own established conventions exactly
(the same pattern already used by `createStaffUser()` in
`src/lib/actions/staff-users.ts`):

- Run manually, once, by whoever has direct access to the production
  database's connection string (`npx tsx prisma/bootstrap-production.ts`)
  - never exposed as an HTTP route, so it carries no network attack
    surface and needs no worker secret of its own.
- Takes the organization's display name and the first OWNER's name/email
  as command-line arguments or environment variables at invocation time -
  never hardcoded, never committed.
- Generates a temporary password server-side the same way
  `generateTemporaryPassword()` already does elsewhere
  (`randomBytes(9).toString("base64url")`), hashes it with `bcrypt` (cost
  factor 10, matching every other password-hashing call site in this
  codebase), and **prints the plaintext temporary password to the
  operator's own terminal exactly once** - never written to a file, never
  logged via `src/lib/logging.ts` (which would otherwise redact it anyway,
  but the point is it should never reach a log stream in the first
  place), never emailed (no email-sending capability exists in this
  codebase).
- **Idempotency guard:** before creating anything, the script checks
  whether an `Organization` already exists at all
  (`prisma.organization.count()`). If the count is anything other than
  zero, it refuses to run and prints an error - this is a genuinely
  one-time bootstrap for an empty database, never a repeatable "add
  another organization" tool (that capability doesn't exist anywhere in
  this codebase today, by design - see `docs/TECHNICAL-DEBT.md` item 9 on
  the current one-`Organization`-per-`Owner` model boundary).
- **First-login password change:** the created `User` row should have
  whatever "must change password" signal the internal staff model
  supports (today, `User` has no `mustChangePassword` field - unlike
  `TenantPortalAccount`/`OwnerPortalAccount`/the Staff Users temporary-
  password flow, which all set one). This is a genuine, minor gap
  surfaced by this audit: **the internal staff password-change-on-first-
  login enforcement that exists for Staff Users' `resetStaffUserPassword()`
  flow does not extend to this bootstrap path**, since the bootstrap
  script would insert the `User` row directly rather than through
  `createStaffUser()`. Documented here as a known limitation of the
  proposed procedure, not silently glossed over; the practical mitigation
  is procedural (the operator hands the temporary password to the real
  first OWNER out-of-band and that person changes it immediately via
  whatever password-change capability the internal UI offers), not a code
  change made as part of this planning-only pass.
- **Auditability:** the script's own `Organization`/`User` creation should
  call the same `auditCreate()` helper every other creation path in this
  codebase already uses (`src/lib/audit.ts`), so the bootstrap event
  itself leaves a normal `AuditLog` row - not a special, invisible
  exception to the audit trail.
- **No permanent bootstrap credential of any kind** - the script needs
  only whatever `DATABASE_URL` access the operator already has to run
  `prisma migrate deploy` in the first place; it introduces no new secret,
  no new environment variable, and no new authenticated route.

## 4. Why a script, not manual `psql`/Prisma Studio

A manual `INSERT` or a Prisma Studio row edit is faster to describe but
strictly less safe: it requires the operator to correctly replicate
`bcrypt` hashing by hand (or paste in a hash generated some other way,
which is easy to get subtly wrong - wrong cost factor, wrong encoding),
and provides no idempotency guard against accidentally running it twice
against a database that already has data. The proposed script is a
handful of lines reusing functions this codebase already has
(`bcrypt.hash`, `randomBytes`, `auditCreate`) - it is not new
infrastructure, just the one call sequence with nothing to call it from
yet.

## 5. Not implemented yet

Per Prompt 25's Step 10 instruction ("DO NOT implement it yet unless
clearly necessary"): this document describes the procedure and the
proposed script's design; **`prisma/bootstrap-production.ts` has not been
written**. It should be implemented in the same session that actually
provisions the first real production database - implementing it now,
against no real target, would be exactly the kind of speculative,
un-exercised code this whole Prompt series has consistently avoided.
