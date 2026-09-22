# Storage Architecture (Design Only - Not Implemented)

Written during the production-readiness hardening pass, for use by a
**future** Document Management task. Nothing in this document is
implemented yet - no upload endpoint, no storage client, no signed-URL
logic exists in this codebase as of this writing. This is deliberately a
design-only deliverable, per the hardening brief's own instruction.

## 1. Current state

The only file-shaped data this codebase handles today:

- **Organization logo** (`src/lib/actions/organization.ts`) - a small
  (~1MB cap) image stored as a base64 string directly in the
  `Organization.logoUrl` Postgres column. Acceptable for exactly one
  small image per organization; explicitly **not** the pattern to reuse
  for anything else (see `docs/MOVE-IN-HANDOVER.md` §13's own reasoning
  for why Move-In photos couldn't reuse it).
- **`MoveInAttachment`** (`prisma/schema.prisma`) - metadata only
  (`fileName`/`mimeType`/`fileSize`/`caption`/`attachmentType`, plus a
  nullable `storageKey` placeholder). No binary column, no upload UI, no
  storage client wired up. Built exactly so a real storage backend can be
  plugged in later without another migration.

No other module stores or references a file today.

## 2. Anticipated future file types

- Move-In / (future) Move-Out inspection photos.
- Tenant identity/contract documents (national ID/Iqama scan, signed
  lease PDF, etc.).
- Owner documents (ID, IBAN certificate, ownership deed).
- (Future) Maintenance work-order photos.

All of these share the same shape: an image or a small document,
uploaded by an authenticated staff member, scoped to one organization,
optionally linked to one specific business record (a Move-In inspection
item, a Contract, an Owner).

## 3. Target architecture

**Supabase Storage, or any S3-compatible object store, behind a thin
abstraction this codebase owns** - never call a storage SDK directly from
a Server Action. The abstraction's shape (illustrative, not final):

```ts
interface StorageAdapter {
  putObject(params: { organizationId: string; key: string; body: Buffer; contentType: string }): Promise<void>;
  getSignedReadUrl(params: { organizationId: string; key: string; expiresInSeconds: number }): Promise<string>;
  deleteObject(params: { organizationId: string; key: string }): Promise<void>;
}
```

Keeping this interface narrow and provider-agnostic is what lets the app
run against Supabase Storage in production and a local/dev-only adapter
(or a mocked one in tests) without any business-logic module knowing the
difference - the same "don't couple domain logic to one provider"
principle `docs/PRODUCTION-DEPLOYMENT.md` applies to hosting/database.

## 4. Storage-key design (never a raw filename)

`{organizationId}/{entityType}/{entityId}/{randomId}.{ext}` - e.g.
`org_abc123/move-in-attachments/mia_xyz789/f3a1c9.jpg`. Rules:

- **Organization-scoped path prefix, always.** Every key starts with the
  owning organization's id - this makes an accidental cross-tenant read
  structurally impossible even before any application-level check runs
  (a misconfigured bucket policy still can't leak Org A's files under Org
  B's prefix if nothing ever constructs a cross-prefix key).
- **Never the user-supplied filename as the storage path** - only as the
  separately-stored `MoveInAttachment.fileName` display value. A raw
  filename in a storage path invites path traversal (`../../etc`) and
  collision.
- **Random id component**, not a sequential/guessable one - so a signed
  URL's expiry is the only thing standing between "authorized" and "not,"
  never security-through-obscurity of an unguessable-but-static key
  scheme.

## 5. Access model

- **Private buckets only.** No object is ever publicly readable by a bare
  URL.
- **Signed URLs, short-lived**, generated server-side only after the
  requesting user's session has already passed the same
  `requirePermission()` check the rest of this codebase uses for
  everything else (e.g. `moveInInspection.update`/`moveIn.view` before
  handing back a signed URL for a Move-In photo) - the authorization
  check happens *before* the signed URL is minted, never delegated to the
  storage provider.
- **No client-side direct-to-bucket upload without a server-issued,
  scoped upload URL** - the server decides the key, the content-type
  allowlist, and the size limit before the client ever gets permission to
  write.

## 6. Upload validation (server-side, before any bytes are accepted)

- **MIME allowlist**, not a client-supplied content-type trusted
  as-is - validate the actual file signature/magic bytes server-side for
  the small set of types actually needed (JPEG/PNG/WebP for photos, PDF
  for documents), never accept an arbitrary MIME type.
- **Size limit enforced server-side** (a reasonable per-file cap, e.g.
  10-15MB for a photo, tuned per file type) - never rely on a client-side
  check alone.
- **No executable content** - the MIME allowlist above is itself the
  primary defense (an allowlist of image/PDF types structurally excludes
  `.exe`/`.sh`/`.js`/etc.), reinforced by never serving an uploaded object
  with a content-type that would let a browser execute it (always served
  with the validated, narrow content-type, never `text/html` or
  unset/sniffed).
- **Filename sanitization for the display value** (even though it's never
  used as the storage path) - strip path separators and control
  characters before persisting `fileName` for display, since it's
  rendered back into the UI later.

## 7. Why this wasn't built now

Building even a minimal real upload flow would mean: choosing and wiring
an actual Supabase Storage (or S3) account/bucket (an infrastructure
decision outside this codebase and outside a hardening task's scope),
adding a new dependency, and introducing a genuinely new capability - all
explicitly excluded by the hardening brief's "no feature creep" list
(which names "Object Storage uploads" directly). This document exists so
that when a dedicated Document Management task *is* scoped, it starts
from an already-reviewed design instead of re-deriving these decisions
(and, in particular, doesn't repeat the organization-logo module's
base64-in-Postgres pattern for anything beyond that one small, already-
accepted use case).
