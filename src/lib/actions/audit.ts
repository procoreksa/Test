"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { categorizeAuditEntry, type AuditCategory } from "@/lib/audit";

const PAGE_SIZE = 25;

export interface AuditLogFilters {
  from?: Date;
  to?: Date;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  financialOnly?: boolean;
  search?: string;
  page?: number;
}

/**
 * MANAGER only ever sees "operational" entries, ACCOUNTANT only ever sees
 * "financial" entries (both fixed by role, not user-chosen), OWNER/ADMIN
 * see everything and may additionally narrow to financial-only via the
 * `financialOnly` filter. Category is derived, not stored - see
 * categorizeAuditEntry() in src/lib/audit.ts.
 */
function roleCategoryFilter(role: string, financialOnly?: boolean): AuditCategory | undefined {
  if (role === "MANAGER") return "operational";
  if (role === "ACCOUNTANT") return "financial";
  if (financialOnly) return "financial";
  return undefined;
}

/** Paginated, filtered audit log listing - never loads the full table into memory. */
export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const { organizationId, role } = await requirePermission("audit.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    userId: filters.userId || undefined,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.search
      ? {
          OR: [
            { entityDisplayName: { contains: filters.search, mode: "insensitive" } },
            { userEmail: { contains: filters.search, mode: "insensitive" } },
            { entityId: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Category is derived from entityType/action, not a column, so the role-
  // based restriction is applied as an entityType/action filter directly
  // rather than a WHERE on a computed value.
  const category = roleCategoryFilter(role, filters.financialOnly);
  if (category === "financial") {
    where.entityType = { in: ["Invoice", "Payment", "OwnerLedgerEntry"] };
  } else if (category === "operational") {
    where.AND = [
      { entityType: { notIn: ["Invoice", "Payment", "OwnerLedgerEntry"] } },
      { action: { notIn: ["LOGIN", "LOGIN_FAILED", "LOGOUT", "PERMISSION_DENIED"] } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, category: categorizeAuditEntry(r.entityType, r.action) })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Chronological audit trail for one specific record - used by <AuditTimeline>. Capped at 100 rows (a detail-page timeline, not a full export). */
export async function getEntityAuditTrail(entityType: string, entityId: string) {
  const { organizationId } = await requirePermission("audit.view");
  return prisma.auditLog.findMany({
    where: { organizationId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Distinct users who have any audit rows in this org - used to populate the filter dropdown without a separate Users list permission check. */
export async function listAuditActors() {
  const { organizationId } = await requirePermission("audit.view");
  const rows = await prisma.auditLog.findMany({
    where: { organizationId, userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true, userEmail: true },
    orderBy: { userId: "asc" },
  });
  return rows
    .filter((r): r is { userId: string; userEmail: string | null } => r.userId !== null)
    .sort((a, b) => (a.userEmail ?? "").localeCompare(b.userEmail ?? ""));
}
