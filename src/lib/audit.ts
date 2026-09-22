import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission } from "@/lib/session";
import type { Permission } from "@/lib/permissions";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Typed audit actions. Kept as a plain string union (not a Prisma enum) per
 * the brief: a new audited action should never require a schema migration.
 * `AuditLog.action` itself is a plain `String` column - this union is the
 * only place action names are type-checked.
 */
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SOFT_DELETE"
  | "ACTIVATE"
  | "DEACTIVATE"
  | "APPROVE"
  | "REJECT"
  | "TERMINATE"
  | "RENEW"
  | "ISSUE"
  | "CANCEL"
  | "VOID"
  | "PAYMENT_RECORDED"
  | "PAYMENT_REVERSED"
  | "OWNERSHIP_ASSIGNED"
  | "OWNERSHIP_ENDED"
  | "LEDGER_POSTED"
  | "LEDGER_REVERSED"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PERMISSION_DENIED";

/**
 * Coarse category used only for UI filtering/role-based visibility on
 * /audit-logs (MANAGER sees "operational", ACCOUNTANT sees "financial",
 * OWNER/ADMIN see everything) - stored in `metadata.category`, not its own
 * column, since it's a presentation concern, not part of the immutable
 * record itself.
 */
export type AuditCategory = "operational" | "financial" | "security";

const FINANCIAL_ENTITY_TYPES = new Set(["Invoice", "Payment", "OwnerLedgerEntry"]);
const SECURITY_ACTIONS = new Set<AuditAction>(["LOGIN", "LOGIN_FAILED", "LOGOUT", "PERMISSION_DENIED"]);

/**
 * Derived (never stored) from `action`/`entityType` - used only to filter
 * /audit-logs by role: MANAGER sees "operational", ACCOUNTANT sees
 * "financial", OWNER/ADMIN see everything. Ownership assignment is
 * "operational" (MANAGER's own `ownership.manage` responsibility), while
 * actual money movements (Invoice/Payment/OwnerLedgerEntry) are "financial"
 * (ACCOUNTANT's domain) - see docs/AUDIT-AND-FINANCIAL-CONTROLS.md.
 */
export function categorizeAuditEntry(entityType: string, action: string): AuditCategory {
  if (SECURITY_ACTIONS.has(action as AuditAction)) return "security";
  if (FINANCIAL_ENTITY_TYPES.has(entityType)) return "financial";
  return "operational";
}

// ---------------------------------------------------------------------------
// Redaction - see docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Redaction rules".
// Applied unconditionally inside writeAuditLog(), so no call site can ever
// forget to redact - this is the single choke point every audit row passes
// through before hitting the database.
// ---------------------------------------------------------------------------

/** Fields whose value must never appear in an audit record, under any entity. */
const REDACTED_FIELDS = new Set([
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "apiKey",
  "secret",
  "authSecret",
]);

/** Fields that are technically not secret but are large binary blobs with no audit value - dropped rather than stored twice per row. */
const OMITTED_FIELDS = new Set(["logoUrl"]);

/** Fields masked to their last 4 characters (e.g. IBAN) rather than fully redacted, so a record of *which* value changed still exists without exposing it. */
const MASKED_TAIL_FIELDS = new Set(["iban"]);

function maskTail(value: string): string {
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function redactValue(key: string, value: unknown): unknown {
  if (REDACTED_FIELDS.has(key)) return "[redacted]";
  if (OMITTED_FIELDS.has(key)) return value ? "[omitted]" : value;
  if (MASKED_TAIL_FIELDS.has(key) && typeof value === "string" && value.length > 0) return maskTail(value);
  return value;
}

function redactRecord(record: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

/** Normalizes a value for comparison so Decimal/Date/plain-value pairs from different layers of the app compare correctly. */
function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}

/** Bookkeeping columns that change on every save regardless of whether any real field did - never meaningful on their own, so diffFields() ignores them entirely rather than reporting a no-op UPDATE. */
const ALWAYS_IGNORED_DIFF_FIELDS = new Set(["id", "createdAt", "updatedAt", "organizationId"]);

/**
 * Compares `before`/`after` field-by-field and returns only the keys whose
 * normalized value actually differs, on both sides - so an UPDATE audit
 * entry records "annualRent: 80000 -> 85000" instead of a full duplicate of
 * every field on the row, most of which never changed.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (ALWAYS_IGNORED_DIFF_FIELDS.has(key)) continue;
    const b = normalize(before[key]);
    const a = normalize(after[key]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
}

// ---------------------------------------------------------------------------
// Low-level writer
// ---------------------------------------------------------------------------

export interface WriteAuditLogInput {
  organizationId: string;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityDisplayName?: string | null;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * The single choke point every audit row passes through. Takes the same
 * transaction client (`tx`) as the mutation it's recording, so the two
 * either both commit or both roll back together (see docs/
 * AUDIT-AND-FINANCIAL-CONTROLS.md, "Database transaction strategy") - pass
 * the plain `prisma` client only for events that have no surrounding
 * mutation (login/logout/permission-denied).
 */
export async function writeAuditLog(tx: Tx, input: WriteAuditLogInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      userRole: input.userRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityDisplayName: input.entityDisplayName ?? null,
      previousValues: redactRecord(input.previousValues ?? undefined) as Prisma.InputJsonValue,
      newValues: redactRecord(input.newValues ?? undefined) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

interface AuditSessionInfo {
  organizationId: string;
  userId: string;
  userEmail: string;
  userRole: string;
}

/** Identity captured straight from the authenticated session's signed JWT - the same source requirePermission() trusts, never client input. */
async function auditSessionInfo(): Promise<AuditSessionInfo> {
  const { user } = await requireSession();
  return { organizationId: user.organizationId, userId: user.id, userEmail: user.email, userRole: user.role };
}

// ---------------------------------------------------------------------------
// High-level helpers - call these from server actions instead of building
// AuditLog rows by hand, so every module records the same shape.
// ---------------------------------------------------------------------------

export interface AuditCreateParams {
  action?: AuditAction;
  entityType: string;
  entityId: string;
  entityDisplayName?: string;
  newValues: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Records a CREATE (or a CREATE-shaped action, e.g. ISSUE for a new invoice) with the session's identity filled in automatically. */
export async function auditCreate(tx: Tx, params: AuditCreateParams): Promise<void> {
  const session = await auditSessionInfo();
  await writeAuditLog(tx, {
    ...session,
    action: params.action ?? "CREATE",
    entityType: params.entityType,
    entityId: params.entityId,
    entityDisplayName: params.entityDisplayName,
    newValues: params.newValues,
    metadata: params.metadata,
  });
}

export interface AuditUpdateParams {
  action?: AuditAction;
  entityType: string;
  entityId: string;
  entityDisplayName?: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Records an UPDATE, diffing `before`/`after` down to only the fields that
 * actually changed (diffFields()). Writes nothing at all if nothing
 * meaningful changed, so a no-op form submit doesn't create audit noise.
 */
export async function auditUpdate(tx: Tx, params: AuditUpdateParams): Promise<void> {
  const { before, after } = diffFields(params.before, params.after);
  if (Object.keys(after).length === 0) return;
  const session = await auditSessionInfo();
  await writeAuditLog(tx, {
    ...session,
    action: params.action ?? "UPDATE",
    entityType: params.entityType,
    entityId: params.entityId,
    entityDisplayName: params.entityDisplayName,
    previousValues: before,
    newValues: after,
    metadata: params.metadata,
  });
}

export interface AuditActionParams {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityDisplayName?: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Records a state-transition action with no field diff (TERMINATE, CANCEL, RENEW, LEDGER_REVERSED, ...) - identity filled in from the session automatically. */
export async function auditAction(tx: Tx, params: AuditActionParams): Promise<void> {
  const session = await auditSessionInfo();
  await writeAuditLog(tx, { ...session, ...params });
}

/**
 * Records a denied mutation attempt. Called from within the `catch` of a
 * server action after requirePermission() throws AuthorizationError - never
 * for ordinary read denials, to avoid audit noise (see Step 16 of the
 * brief). Swallows its own errors (a session that vanished mid-request is
 * not itself worth crashing the request over) since this always runs
 * best-effort, after the real authorization decision has already been made.
 */
export async function auditPermissionDenied(params: {
  permission: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    const { user } = await requireSession();
    await writeAuditLog(prisma, {
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "PERMISSION_DENIED",
      entityType: params.entityType ?? "Permission",
      entityId: params.entityId ?? params.permission,
      metadata: { permission: params.permission },
    });
  } catch {
    // No session at all to attribute the denial to - nothing useful to record.
  }
}

/**
 * Drop-in replacement for `requirePermission()` on the handful of
 * high-value mutations worth auditing a denied attempt on (contract
 * termination/renewal, invoice cancellation, payment/ledger reversal,
 * ownership changes - see Step 16 of the brief). Not used for every action
 * in the codebase - most `requirePermission()` call sites are left exactly
 * as they were, to avoid turning routine authorization noise into audit
 * rows. Re-throws whatever `requirePermission()` throws, after recording
 * the denial.
 */
export async function requirePermissionAudited(
  permission: Permission,
  entityType?: string,
  entityId?: string
): ReturnType<typeof requirePermission> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    await auditPermissionDenied({ permission, entityType, entityId });
    throw error;
  }
}

/** Records a login/logout security event. Called from src/lib/auth.ts, which has no session yet (LOGIN/LOGIN_FAILED) or only the JWT (LOGOUT) - never from a server action, so it always writes through the plain `prisma` client. */
export async function auditLoginEvent(params: {
  action: "LOGIN" | "LOGIN_FAILED" | "LOGOUT";
  organizationId: string;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await writeAuditLog(prisma, {
    organizationId: params.organizationId,
    userId: params.userId,
    userEmail: params.userEmail,
    userRole: params.userRole,
    action: params.action,
    entityType: "Session",
    entityId: params.userId ?? params.userEmail ?? "unknown",
    metadata: params.metadata,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}
