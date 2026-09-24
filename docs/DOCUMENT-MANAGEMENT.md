# Document Management

## 1. Overview & scope

A centralized, secure Document Management layer for this multi-tenant
property management SaaS: `Business Entity -> DocumentLink -> Document ->
DocumentVersion -> Storage Adapter -> Authorized Download -> Audit`. It
lets internal staff, tenants, and owners upload, version, and download
files (PDF/JPEG/PNG/WEBP) attached to existing business records, without
duplicating those records or weakening their security boundaries. Internal
Document Center at `/documents`, Tenant Portal at `/portal/documents`,
Owner Portal at `/owner-portal/documents`.

## 2. Architecture audit (Step 1 findings)

Before writing any code, a full audit of the existing codebase (see the
Step 1 findings delivered to the user) established: three existing
metadata-only attachment models (`MoveInAttachment`/`MoveOutAttachment`/
`MaintenanceAttachment`, all with a nullable `storageKey` placeholder and
no binary column); zero real object-storage integration anywhere; the only
real-bytes precedent is `Organization.logoUrl` (a base64 data URI, 1MB cap,
narrowly scoped and never reused); `/api/*` routes are excluded from
`src/proxy.ts`'s middleware entirely, so any download route must
authenticate/authorize itself; `src/lib/tenant-session.ts`/
`src/lib/owner-session.ts` already have the exact entitlement-helper shape
to extend; `getEffectiveOwners()` (`src/lib/ownership.ts`) is the single
ownership resolver to reuse; and no PDF-generation library exists, so every
"printable document" in this codebase is a server-rendered page, never a
stored file - confirming Critical Principle 7 was already the status quo.

## 3. Critical Principle 1 - Metadata ≠ File Content

`Document`/`DocumentVersion` store only metadata (title, category, MIME
type, size, checksum, a storage key). Actual file bytes never touch a
Postgres column - they live behind the storage adapter, addressed only by
`DocumentVersion.storageKey`. This deliberately does not reuse
`Organization.logoUrl`'s base64-in-Postgres pattern.

## 4. Critical Principle 2 - Storage Provider Agnostic

Every storage operation goes through the `DocumentStorageProvider`
interface (`src/lib/documents/providers/types.ts`) -
`putObject`/`getObject`/`exists`/`deleteObject`. No business action, page,
or route ever touches a filesystem path or a vendor SDK directly. Adding a
real production adapter later means implementing this interface and
returning it from the factory; no other file changes.

## 5. Critical Principle 3 - Document ID is NOT Authorization

Every single download/preview request re-authorizes the principal against
the document's live security context, on every request, with no session-
level caching: `requirePermission("document.download")` for internal
staff, `requireTenantDocumentAccess()`/`requireOwnerDocumentAccess()` for
the portals. Knowing a `documentId` (or a storage key) grants nothing by
itself.

## 6. Critical Principle 4 - Private by Default

No public URLs, no predictable paths, no permanent public bucket URLs.
LOCAL_DEV storage lives outside any public static directory and is only
ever reached through an authorized server route. The entity-authorization
registry (§15) defaults every unlisted tenant/owner entitlement case to
`false` - a new entity type is closed to a portal until a deliberate
decision opens it.

## 7. Critical Principle 5 - Version History

`DocumentVersion` rows are immutable and append-only. Replacing a file
never destroys history - it creates a new version and re-points
`Document.currentVersionId`. See §13/§17/§26.

## 8. Critical Principle 6 - Portal Visibility is Explicit

`Document.visibility` (`INTERNAL_ONLY`/`TENANT_VISIBLE`/`OWNER_VISIBLE`) is
a flag only - never sufficient by itself. Every portal access is a dual
gate: visibility AND live entitlement, both required
(`isDocumentAccessible()` in `src/lib/documents/visibility.ts`). See §32-34.

## 9. Critical Principle 7 - Generated Document ≠ Uploaded File

Existing printable views (tax invoice, statements, Move-In/Move-Out
reports, settlement statements) remain dynamically server-rendered pages.
This module never auto-converts them into stored PDFs, and no PDF-
generation engine was added.

## 10. Core architecture pipeline (reference)

```
Business Entity (Contract/Unit/Renter/Owner/...)
        |
        v
DocumentLink (secondary, non-authorizing discoverability only)
        |
Document (ONE authoritative security context: type + id, category,
          status, visibility, currentVersionId)
        |
        v
DocumentVersion (immutable: fileName, mimeType, fileSize, checksum,
                 storageProvider, storageKey, versionNumber)
        |
        v
DocumentStorageProvider (LOCAL_DEV | S3_COMPATIBLE)
        |
        v
Authorized Download Route (re-authorizes every request, streams safely)
        |
        v
AuditLog (create/version/visibility/archive/restore/link/download)
```

## 11. Schema: enums

`DocumentEntityType` (the fixed V1 supported list - Step 5): `RENTER`,
`OWNER`, `CONTRACT`, `UNIT`, `COMPOUND`, `BUILDING`, `INVOICE`, `PAYMENT`,
`MAINTENANCE_REQUEST`, `MOVE_IN`, `MOVE_OUT`,
`SECURITY_DEPOSIT_SETTLEMENT`, `CORPORATE_ACCOUNT`, `CORPORATE_OCCUPANT`.
`DocumentCategory` (display/filter only - never grants access):
`CONTRACT`, `IDENTITY`, `OWNERSHIP_DEED`, `BANK_DETAIL`,
`MOVE_IN_EVIDENCE`, `MOVE_OUT_EVIDENCE`, `SECURITY_DEPOSIT_EVIDENCE`,
`MAINTENANCE_EVIDENCE`, `PAYMENT_RECEIPT`, `CORPORATE_ACCOUNT_DOCUMENT`,
`BUILDING_PLAN`, `GENERAL`, `OTHER`. `DocumentStatus`: `ACTIVE` |
`ARCHIVED`. `DocumentVisibility`: `INTERNAL_ONLY` | `TENANT_VISIBLE` |
`OWNER_VISIBLE`. `StorageProvider`: `LOCAL_DEV` | `S3_COMPATIBLE`.
`DocumentScanStatus` (honest placeholder - see §23): `NOT_SCANNED` |
`CLEAN` | `BLOCKED` | `FAILED`.

## 12. Schema: `Document`

`documentNumber` (`DOC-000001`, via the existing Counter infrastructure),
`title`, `category`, `status`, `visibility`,
`securityContextEntityType`/`Id` (the one authoritative link - a plain
`(type, id)` pair, same pattern as `CommunicationMessage.businessEntityType/
Id`), `securityContextChangedAt`/`ByUserId` (§36),
`currentVersionId` (nullable + a separate unique FK, flipped as the last
step of finalize), `createdByUserId`, `archivedAt`/`ByUserId`,
`restoredAt`/`ByUserId`. Indexed by
`(organizationId, securityContextEntityType, securityContextEntityId)`,
`(organizationId, status)`, `(organizationId, category)`,
`(organizationId, createdAt)`.

## 13. Schema: `DocumentVersion`

Immutable once created. `versionNumber` (starts at 1, per-document,
Counter-backed - see §17), `fileName` (sanitized display name),
`mimeType`, `fileSize`, `checksumSha256`, `storageProvider`, `storageKey`
(opaque, never exposed to any client), `scanStatus`, `uploadedByUserId`.
`@@unique([documentId, versionNumber])` is a DB-enforced backstop against
ever creating a duplicate version number.

## 14. Schema: `DocumentLink`

Secondary, **non-authorizing** discoverability links only (e.g. showing a
Contract's Document on the linked Renter's page too) - never consulted by
any authorization check. `@@unique([documentId, entityType, entityId])`
(Step 72) makes a duplicate/resubmitted link a silent no-op rather than an
error or a duplicate row.

## 15. Supported entity types & the centralized authorization registry

`src/lib/documents/entity-registry.ts` is the single Link Authorization
Registry (Step 6) - no scattered switch statements anywhere else. Each of
the 14 entity types has one entry with three functions:
`existsInOrganization` (org-scoped existence check, used at upload/link
time), `resolveTenantEntitlement`, `resolveOwnerEntitlement`. Owner
entitlement for every asset-shaped type (`UNIT`/`BUILDING`/`COMPOUND`, and
`CONTRACT`/`MAINTENANCE_REQUEST`/`MOVE_IN`/`MOVE_OUT`/
`SECURITY_DEPOSIT_SETTLEMENT` resolved through their linked asset) calls
`getEffectiveOwners()` (`src/lib/ownership.ts`) - the exact resolver every
other Owner Portal screen already uses, never reimplemented. Tenant
entitlement is deliberately conservative: only `RENTER` (self),
`CONTRACT`, `INVOICE`, `PAYMENT`, `MAINTENANCE_REQUEST`, `MOVE_IN`,
`MOVE_OUT`, and `SECURITY_DEPOSIT_SETTLEMENT` resolve to a real per-renter
check; `COMPOUND`/`BUILDING`/`CORPORATE_ACCOUNT`/`CORPORATE_OCCUPANT`
always resolve `false` for tenants (never in the Tenant Portal's allow-
list - Step 55). `INVOICE`/`PAYMENT`/`RENTER`/`CORPORATE_ACCOUNT`/
`CORPORATE_OCCUPANT` always resolve `false` for owners (Step 53/54/91's
financial-isolation and internal-only boundaries).

## 16. Primary security context & confused-deputy prevention

Each Document has exactly ONE authoritative security context
(`securityContextEntityType`/`Id` on the `Document` row itself, never a
`DocumentLink`). Every authorization decision anywhere in the app resolves
against this one pair, and only this pair - a secondary `DocumentLink`
never grants access, preventing a caller from "confused-deputy"-ing their
way in via an unrelated relation (Step 11/12).

## 17. Document numbering & version numbering

`formatDocumentNumber(seq)` (`src/lib/numbering.ts`, `DOC-000001`, no year
component) + `nextCounterValue(tx, organizationId, "document")` - the same
Counter infrastructure every other numbering scheme in this codebase uses.
Version numbers use a per-document Counter key
(`` `documentVersion:${documentId}` ``), including for version 1 itself
(computed inside `createDocumentWithFile()`'s own transaction) - keeping
the "document" and "documentVersion:*" numbering paths on the exact same
mechanism so a later `addDocumentVersion()` call can never collide with
version 1. This is atomic under concurrency: two simultaneous
`addDocumentVersion()` calls each get a distinct number from the Counter
row's own atomic upsert-increment, and `@@unique([documentId,
versionNumber])` is a second, DB-enforced backstop (Step 14/32 - see the
mandatory concurrency test in §39).

## 18. Storage provider abstraction (`DocumentStorageProvider`)

`src/lib/documents/providers/`:
- `types.ts` - the interface + `StorageProviderNotConfiguredError`.
- `local-dev.ts` / `local-dev-path.ts` - the dev adapter (§19).
- `s3-compatible.ts` - the production boundary (§20).
- `factory.ts` - `getDefaultStorageProviderKind()` (S3_COMPATIBLE if fully
  configured via env vars, else LOCAL_DEV) and `getStorageProviderByKind()`
  (resolves whichever adapter an already-stored `DocumentVersion` was
  written with - existing versions never get silently migrated to a
  different provider).
- `mock.ts` - `MockStorageProvider`, a deterministic in-memory adapter for
  tests (put/get/exists/delete, `simulateNextPutFailure()`/
  `simulateNextDeleteFailure()`), zero filesystem/network access.

Business actions never call a concrete adapter directly - they resolve one
via the factory, or accept it injected (`DocumentActionDeps`) for tests.

## 19. LOCAL_DEV adapter (non-production)

`LocalDevStorageProvider` (Step 17) - filesystem-backed, default directory
`<project root>/var/document-storage` (gitignored), well outside `public/`
and never a Next.js-served static path. Every path is re-validated through
`resolveWithinBaseDir()` (`local-dev-path.ts`) before any filesystem call -
a corrupted/malicious key can never escape the base directory, even though
keys are always machine-generated and never user-supplied. Files are only
ever reachable through the authorized download route, which calls
`getObject()` after re-authorizing the request - never any direct URL or
static file serving. Explicitly documented here as **not production-
ready**: no redundancy, no backup story of its own beyond whatever backs up
the container filesystem, and not multi-instance-safe.

## 20. S3_COMPATIBLE adapter (production boundary, validate-only)

`S3CompatibleStorageProvider` reads `DOCUMENT_S3_ENDPOINT`,
`DOCUMENT_S3_REGION`, `DOCUMENT_S3_BUCKET`, `DOCUMENT_S3_ACCESS_KEY_ID`,
`DOCUMENT_S3_SECRET_ACCESS_KEY` from the environment only - never from the
database (Step 19). No S3-compatible SDK or real credentials exist in this
environment (confirmed by the Step 1 audit), so this class is deliberately
a **validated boundary, not a working client**: it always constructs and
reports `isConfigured`, but every operation throws a clear
`StorageProviderNotConfiguredError`/"no client implementation is wired in
yet" error - honest, in the same spirit as Notifications' Critical
Principle 6 (no false claim of a working integration that was never
exercised). **This codebase does not currently claim S3_COMPATIBLE
production-readiness** - see §40/docs/PRODUCTION-DEPLOYMENT.md.

## 21. Filename sanitization & Content-Disposition safety

`src/lib/documents/filename.ts`: `sanitizeFileName()` strips path
separators/traversal sequences, control characters (incl. null bytes),
leading dots, and bounds length (Step 21) - applied to every uploaded
file's display name before it's ever persisted or echoed back.
`safeContentDisposition()` builds a quoted, CRLF-injection-safe
`Content-Disposition` header (ASCII fallback + RFC 5987 `filename*=UTF-8''`
extended form for non-ASCII names, e.g. Arabic) (Step 37).

## 22. File-type allow-list, size limit, MIME/extension/magic-byte validation

`src/lib/documents/file-validation.ts`: V1 allow-list is exactly PDF/JPEG/
PNG/WEBP (Step 22). `validateUploadedFile()` is the single choke point
every upload goes through - checks size (`MAX_FILE_SIZE_BYTES` = 15MB,
Step 24), MIME allow-list, extension-vs-MIME consistency, and the actual
byte signature (`matchesFileSignature()`, Step 23) together, so a renamed
executable or an HTML/SVG file claiming an allowed MIME type is rejected
regardless of its extension or client-supplied `Content-Type`.

## 23. Checksum (SHA-256) & malware-scan honesty

`computeSha256()` (`src/lib/documents/checksum.ts`) - integrity only, never
used for authorization or deduplication-as-access-control (Step 25). No
malware scanning exists in this codebase (Step 26, honestly documented):
every `DocumentVersion.scanStatus` is created `NOT_SCANNED` and stays that
way; the `CLEAN`/`BLOCKED`/`FAILED` values exist only so a future real
scanner integration has somewhere to write its result without a schema
migration - not implemented, not stubbed further than the field itself.

## 24. Upload flow & storage/DB consistency strategy (Step 28 decision)

Flow (Step 27): authorize (`requirePermission`) -> validate entity context
(`entityExistsInOrganization`) -> validate metadata (zod) -> validate file
(`validateUploadedFile`) -> **write to storage** -> finalize in one DB
transaction (create `Document`/`DocumentVersion`, set `currentVersionId`,
write the audit row).

**Decision**: the storage write happens *before* the DB transaction, not
after. True cross-system atomicity between Postgres and an object store is
not achievable, so this module picks the side that fails safe: if the DB
transaction then fails for any reason, the just-written object is
compensating-deleted (§25); a Document/DocumentVersion row is *never*
created without real bytes behind it. The one residual risk this doesn't
eliminate is a crash between the successful storage write and a
successful-but-never-acknowledged compensating delete, which can leave an
orphaned storage object with no DB reference - a storage-cost problem,
never a security problem (the object has no reachable path without a DB
row, and Critical Principle 3 means a bare key is never itself
authorization). This is the same architectural-honesty posture
Notifications' outbox decision took for its own failure domain.

## 25. Orphan-object cleanup (compensating delete)

Both `createDocumentWithFile()` and `addDocumentVersion()` wrap their DB
transaction in a `try/catch`: on any transaction failure, they call
`storageProvider.deleteObject({ key })` for the object they just wrote
(best-effort - a failed compensating delete is swallowed, not re-thrown,
since the original transaction error is the one that matters to the
caller) (Step 29). Verified by dedicated real-DB tests forcing a genuine
Postgres unique-constraint failure after a real storage write - see §39.

## 26. Centralized upload/version actions

`src/lib/actions/documents.ts` - `createDocumentWithFile()` and
`addDocumentVersion()` are the only two places in the codebase that create
a `DocumentVersion` row (Step 30/31); no module reimplements this. Both
accept an optional `deps: { storageProvider }` seam used only by tests
(production call sites always omit it and get the factory-resolved
provider). Also: `changeDocumentVisibility()`, `changeDocumentSecurityContext()`
(§36), `archiveDocument()`/`restoreDocument()` (§27), `addDocumentLink()`/
`removeDocumentLink()`, `listDocuments()` (server-side paginated, Step 85),
`getDocumentDetail()`, `listDocumentsForEntity()` (used by the integration
cards, §31).

## 27. Archive/restore

`archiveDocument()`/`restoreDocument()` toggle `Document.status` and
record `archivedAt`/`ByUserId` or `restoredAt`/`ByUserId` plus an
`ARCHIVE`/`RESTORE` audit row (Step 33/34). Version history is retained
either way - archiving never touches `DocumentVersion` rows. Archived
documents are hidden from `listDocuments()`'s default view (explicit
`status: "ARCHIVED"` filter required to see them) and are fully
inaccessible to Tenant/Owner Portals (§29), while internal staff with
`document.download` may still reach them.

## 28. Protected download route(s) & headers

Three routes, one shared core (`streamDocumentVersion()` in
`src/lib/documents/download.ts`), since `/api/*` is outside
`src/proxy.ts`'s middleware entirely (§2) and each principal type has its
own authentication/authorization story:
- `GET /api/documents/[documentId]/download` (internal - `auth()` +
  `can("document.download", role)`, accepts `?versionId=` for historical
  versions and `?mode=inline` for preview).
- `GET /api/portal/documents/[documentId]/download` (tenant -
  `requireTenantDocumentAccess()`, no `versionId` parameter accepted).
- `GET /api/owner-portal/documents/[documentId]/download` (owner -
  `requireOwnerDocumentAccess()`, no `versionId` parameter accepted).

Response headers: validated stored `mimeType` as `Content-Type`,
`X-Content-Type-Options: nosniff` (Step 38), `Cache-Control: private,
no-store` (Step 39), and `safeContentDisposition()` (§21) for
`inline`/`attachment`. A missing storage object behind an existing
`DocumentVersion` row (Step 81) returns a plain 404 and records a
best-effort integrity-flagged audit row - never a 500 that might hint at
internal state.

## 29. Version-download policy & inline-preview safety

Conservative by design (Step 36/77): portals may only ever reach the
document's *current* version - `isVersionDownloadAllowed()`
(`src/lib/documents/visibility.ts`) rejects any other `versionId` outright
for non-`INTERNAL` principals (the portal routes don't even expose the
parameter). Internal staff holding `document.download` may request any
historical version. `isInlinePreviewable()` restricts inline rendering to
exactly PDF/JPEG/PNG/WEBP (Step 40) - everything else is always forced to
`attachment`, and this codebase does no server-side PDF parsing/execution
of any kind.

## 30. Internal Document Center UI

`/documents` (server-side paginated list, filters: category/status/title
search), `/documents/new` (upload form, pre-fillable via
`?entityType=&entityId=` query params from an integration card),
`/documents/[id]` (current version + download/preview, upload-new-version
form, change-visibility form, archive/restore, version history table with
per-version download, linked-records list + add/remove, audit trail).

## 31. Internal integration cards (Contract/Owner) & known gaps (Renter/Unit)

`DocumentsCard` (`src/components/documents-card.tsx`) is a reusable,
RBAC-gated (`document.view`) server component scoped to *exactly* one
`(entityType, entityId)` security context - never widened to "every
document related to this Renter/Contract chain" (Step 46/47's explicit
non-leakage rule). Wired into the Owner detail page (`/owners/[id]`,
replacing its prior placeholder) and the Contract edit page
(`/contracts/[id]/edit`, the closest thing this codebase has to a Contract
detail page). **Known, honestly documented gap**: this codebase has no
dedicated Renter detail page and no general Unit detail page (only
`/units/[id]/ownership`, a narrowly-scoped ownership-management screen) -
so no `DocumentsCard` was force-fitted into either. Renter-/Unit-linked
documents remain fully manageable via the centralized `/documents` list
(filterable by entity), and `DocumentsCard` is ready to drop into a future
Renter/Unit detail page the moment one exists.

## 32. Tenant Portal document support

`/portal/documents` - `getTenantDocuments()`
(`src/lib/actions/portal/documents.ts`) queries every `ACTIVE,
TENANT_VISIBLE` document in the organization, then re-derives live
entitlement per document via the entity registry (§15) rather than
trusting visibility/security-context alone - the same dual gate every
download goes through. Allow-listed by construction (Step 55): only
entity types whose `resolveTenantEntitlement` can return `true` (Contract,
Move-In, Move-Out, Security Deposit Settlement, Renter's own identity) can
ever surface here; Owner documents, internal maintenance evidence,
Corporate Account documents, and other renters' documents are structurally
unreachable, not merely hidden by a UI filter.

## 33. Owner Portal document support

`/owner-portal/documents` - `getOwnerDocuments()`
(`src/lib/actions/owner-portal/documents.ts`), the same shape and dual-gate
pattern, reusing `getEffectiveOwners()` through the entity registry for
live ownership entitlement, including the override and shared-ownership
cases (§15, §39).

## 34. Minimized portal DTOs

`PortalDocumentDto` (`src/lib/documents/portal-dto.ts`) - `documentId`,
`title`, `category`, `currentVersion` (fileName/mimeType/fileSize/
uploadedAt only), `canDownload`. Deliberately excludes `storageKey`,
checksum, uploader identity, internal notes, historical versions, audit
history, and internal `DocumentLink` rows (Step 56/61) - identical shape
for Tenant and Owner portals, since only how it's resolved differs.

## 35. RBAC

Eight new permissions (`document.view/.create/.version.create/.archive/
.restore/.download/.visibility.manage/.link.manage`) - see
`docs/PERMISSIONS.md` for the full matrix and role rationale. OWNER/ADMIN
hold everything; MANAGER gets the day-to-day operational surface (view/
create/version/download/link, never archive/restore/visibility); ACCOUNTANT
gets view/create/download (finance-evidence upload); VIEWER gets view/
download only. Tenant/Owner Portal authorization never calls
`requirePermission()` - each portal uses only its own entitlement layer
(Step 63).

## 36. Security-context immutability policy

**Decision** (Step 73): a Document's authoritative security context *can*
be changed, but only via `changeDocumentSecurityContext()`, gated behind
`document.visibility.manage` (OWNER/ADMIN-only in this RBAC), with strong
validation (the new entity must exist in-org via the same registry upload
uses) and a full audit of the old and new context together. Because portal
entitlement is always resolved fresh per request (never cached), the
"immediate portal-access recalculation" this implies is automatic - there
is no separate recalculation step to run.

## 37. Non-destructive coexistence with existing attachment models

`MoveInAttachment`/`MoveOutAttachment`/`MaintenanceAttachment` are
untouched - no schema change, no behavior change, no forced migration
(Step 49-51/94). A Document may additionally be linked to the same parent
entities those models describe, purely additively. Verified by a dedicated
real-DB test: creating a Document against a *completed* Move-In neither
alters the Move-In row nor weakens `MoveInAttachment`'s own pre-existing
editability rule (still rejecting new attachment metadata on a completed
Move-In, exactly as before Document Management existed) - see §39.

## 38. Financial isolation & Communications boundary

An uploaded `PAYMENT_RECEIPT`-category document is evidence only - it
never creates a `Payment` row, and Security Deposit documents never mutate
Settlement accounting (Step 52/53/91, verified in §39). Document
Management never sends Email/WhatsApp directly and never calls the
Communications module either - "send this document" is explicitly
out of scope for this prompt and, if built later, must go through the
existing centralized Communications module (Step 103), never a new
ad-hoc channel.

## 39. Multi-tenancy & cross-org isolation / real-DB test suite

Four files under `src/lib/actions/__dbtests__/`, all against a real
Postgres database:

- `document-core.db.test.ts` - create/version/archive/restore/visibility/
  links, rejecting a nonexistent or cross-org entity reference (Steps
  69-71), rejecting an invalid file, financial isolation (Step 91), the
  Move-In immutability regression above (Steps 92-94), and cross-org IDOR
  on reads (`getDocumentDetail`/`listDocuments`).
- `document-concurrency-and-storage-failures.db.test.ts` - the mandatory
  two-concurrent-`addDocumentVersion()`-calls race (Step 32: no duplicate
  version numbers, no corrupted `currentVersionId`), a genuine DB-
  transaction failure *after* a successful storage write (forced
  deterministically via a real Postgres unique-constraint collision) for
  both `createDocumentWithFile()` and `addDocumentVersion()`, proving
  `currentVersionId` stays unchanged, no fake version is created, and the
  orphaned object is compensating-deleted (Steps 28/78-79), and a storage-
  write failure outright for both actions, proving nothing is created at
  all (Step 80).
- `document-portal-access.db.test.ts` - Tenant A cannot access Tenant B's
  document even in the same organization (Step 57), an `INTERNAL_ONLY`
  document is never tenant-reachable, the Owner ownership-override case
  (Step 59, critical), the shared-ownership case (Step 60), a visibility
  change taking effect immediately with no session caching (Step 74), an
  ownership revocation taking effect immediately (Step 75), archived
  documents becoming portal-inaccessible while staying internally
  reachable (Step 76), and current-version semantics (a new version
  immediately changes what a portal sees) (Step 77).
- `document-test-helpers.ts` - shared fixtures (`pdfFile()`,
  `documentFormData()`, `newMockStorageProvider()`).

All new tests pass; the full pre-existing real-DB suite remains green
alongside them (see the Final Report for the exact combined count).

## 40. Explicitly not implemented (strict no-feature-creep boundary)

Per this module's own explicit scope: no OCR, no AI document extraction/
classification/summarization, no digital signatures or e-signature, no
contract-signing workflow, no document approval workflow, no document
expiry scheduler, no passport/national-ID OCR, no real virus-scanner
integration (only the honest `scanStatus` placeholder - §23), no public
document sharing links, no Dropbox/Google Drive sync, no document
collaboration/comments/annotations, no office editor, no PDF editor, no
PDF generation engine, no email/WhatsApp document sending (§38), no
Corporate Portal, no Vendor Portal, no marketing use of documents, no full
legacy-attachment migration (§37), and no general records-management
suite. None of these were implemented, stubbed, or partially started.
Also not implemented: a working `S3_COMPATIBLE` production storage client
(§20 - the adapter boundary exists and is tested, but there is no real
object-storage account configured in this environment, exactly mirroring
this codebase's pre-existing `docs/STORAGE-ARCHITECTURE.md` posture).
