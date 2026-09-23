"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CorporateOccupantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditCreate, auditUpdate, requirePermissionAudited } from "@/lib/audit";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * Corporate Occupant server actions (docs/CORPORATE-HOUSING.md, "Corporate
 * Occupant vs Renter"). Deliberately minimal PII - no passport/national-ID
 * scans, no medical data, no salary, no bank details.
 */

const PAGE_SIZE = 25;

export interface CorporateOccupantListFilters {
  search?: string;
  corporateAccountId?: string;
  status?: CorporateOccupantStatus;
  page?: number;
}

/** Server-side searched/filtered/paginated list (Step 31), with each occupant's current (ACTIVE) housing allocation, if any. */
export async function listCorporateOccupants(filters: CorporateOccupantListFilters = {}) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.CorporateOccupantWhereInput = {
    organizationId,
    corporateAccountId: filters.corporateAccountId || undefined,
    status: filters.status,
    ...(filters.search
      ? { OR: [{ fullName: { contains: filters.search, mode: "insensitive" } }, { fullNameAr: { contains: filters.search, mode: "insensitive" } }, { employeeNumber: { contains: filters.search, mode: "insensitive" } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.corporateOccupant.findMany({
      where,
      include: {
        corporateAccount: { select: { displayName: true, accountNumber: true } },
        allocations: { where: { status: "ACTIVE" }, select: { id: true, unit: { select: { unitNumber: true } } }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateOccupant.count({ where }),
  ]);

  return { rows, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

const upsertSchema = z.object({
  occupantId: z.string().optional(),
  corporateAccountId: z.string().min(1),
  employeeNumber: z.string().optional(),
  fullName: z.string().min(1),
  fullNameAr: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT_COMPANY"]).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
});

export async function upsertCorporateOccupant(formData: FormData): Promise<string> {
  const isUpdate = !!formData.get("occupantId");
  const { organizationId } = await requirePermissionAudited(isUpdate ? "corporateOccupant.update" : "corporateOccupant.create", "CorporateOccupant");
  const t = getDictionary(await getLocale());
  const parsed = upsertSchema.parse({
    occupantId: formData.get("occupantId") || undefined,
    corporateAccountId: formData.get("corporateAccountId"),
    employeeNumber: formData.get("employeeNumber") || undefined,
    fullName: formData.get("fullName"),
    fullNameAr: formData.get("fullNameAr") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    nationality: formData.get("nationality") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    department: formData.get("department") || undefined,
    status: formData.get("status") || undefined,
    emergencyContactName: formData.get("emergencyContactName") || undefined,
    emergencyContactPhone: formData.get("emergencyContactPhone") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const occupantId = await prisma.$transaction(async (tx) => {
    const account = await tx.corporateAccount.findFirst({ where: { id: parsed.corporateAccountId, organizationId } });
    if (!account) throw new Error(t.corporateHousing.accountNotFound);

    const data = {
      employeeNumber: parsed.employeeNumber,
      fullName: parsed.fullName,
      fullNameAr: parsed.fullNameAr,
      email: parsed.email || undefined,
      phone: parsed.phone,
      nationality: parsed.nationality,
      jobTitle: parsed.jobTitle,
      department: parsed.department,
      emergencyContactName: parsed.emergencyContactName,
      emergencyContactPhone: parsed.emergencyContactPhone,
      notes: parsed.notes,
    };

    if (parsed.occupantId) {
      const before = await tx.corporateOccupant.findFirst({ where: { id: parsed.occupantId, organizationId, corporateAccountId: parsed.corporateAccountId } });
      if (!before) throw new Error(t.corporateHousing.occupantNotFound);
      const updated = await tx.corporateOccupant.update({ where: { id: parsed.occupantId }, data: { ...data, status: parsed.status ?? before.status } });
      await auditUpdate(tx, {
        entityType: "CorporateOccupant",
        entityId: updated.id,
        entityDisplayName: updated.fullName,
        before: { fullName: before.fullName, status: before.status },
        after: { fullName: updated.fullName, status: updated.status },
      });
      return updated.id;
    }

    const created = await tx.corporateOccupant.create({ data: { ...data, organizationId, corporateAccountId: parsed.corporateAccountId, status: parsed.status ?? "ACTIVE" } });
    await auditCreate(tx, {
      entityType: "CorporateOccupant",
      entityId: created.id,
      entityDisplayName: created.fullName,
      newValues: { corporateAccountId: parsed.corporateAccountId, fullName: created.fullName, status: created.status },
    });
    return created.id;
  });

  revalidatePath("/corporate-housing/occupants");
  revalidatePath(`/corporate-housing/accounts/${parsed.corporateAccountId}`);
  return occupantId;
}

/** Full profile data for /corporate-housing/occupants/[id] (Step 32). */
export async function getCorporateOccupantById(occupantId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const occupant = await prisma.corporateOccupant.findFirst({
    where: { id: occupantId, organizationId },
    include: { corporateAccount: { select: { id: true, displayName: true, accountNumber: true } } },
  });
  if (!occupant) throw new Error("Not found");

  const [allocations, maintenanceRequests] = await Promise.all([
    prisma.corporateHousingAllocation.findMany({
      where: { organizationId, occupantId },
      include: { unit: { select: { unitNumber: true } }, contract: { select: { contractNumber: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId, corporateOccupantId: occupantId },
      select: { id: true, requestNumber: true, category: true, priority: true, status: true, reportedAt: true },
      orderBy: { reportedAt: "desc" },
    }),
  ]);

  return { occupant, allocations, maintenanceRequests };
}
