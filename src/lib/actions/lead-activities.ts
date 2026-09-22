"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

function activitySchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    leadId: z.string().min(1),
    activityType: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE", "FOLLOW_UP", "STATUS_CHANGE", "OTHER"]),
    subject: z.string().optional(),
    notes: z.string().optional(),
    activityDate: z.coerce.date().optional(),
    nextFollowUpAt: z.coerce.date().optional(),
  }).refine((v) => v.subject || v.notes, { message: t.validation.nameRequired });
}

/**
 * LeadActivity is business interaction history (what leasing staff did with
 * a prospect), distinct from AuditLog (the system/security change record) -
 * see docs/CRM-LEADS.md, "LeadActivity vs AuditLog". This is intentionally
 * NOT audited itself; the fact that an activity was logged is not a
 * security-relevant event.
 *
 * `createdByUserId` is always the session user - never accepted from the
 * client (Step 23), and the lead's organizationId is verified against the
 * caller's session organizationId before anything is written.
 */
export async function createLeadActivity(formData: FormData) {
  const { organizationId } = await requirePermission("leadActivity.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = activitySchema(t).parse({
    leadId: formData.get("leadId"),
    activityType: formData.get("activityType"),
    subject: formData.get("subject") || undefined,
    notes: formData.get("notes") || undefined,
    activityDate: formData.get("activityDate") || undefined,
    nextFollowUpAt: formData.get("nextFollowUpAt") || undefined,
  });

  await prisma.$transaction(async (tx) => {
    // Verifies the lead belongs to the caller's own organization - a lead id
    // from another organization throws here (Prisma "record not found"),
    // never silently attaches the activity to someone else's lead.
    await tx.lead.findUniqueOrThrow({ where: { id: parsed.leadId, organizationId } });

    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: parsed.leadId,
        activityType: parsed.activityType,
        subject: parsed.subject,
        notes: parsed.notes,
        activityDate: parsed.activityDate ?? new Date(),
        createdByUserId: user.id,
      },
    });

    if (parsed.nextFollowUpAt) {
      await tx.lead.update({ where: { id: parsed.leadId }, data: { nextFollowUpAt: parsed.nextFollowUpAt, lastContactAt: new Date() } });
    } else {
      await tx.lead.update({ where: { id: parsed.leadId }, data: { lastContactAt: new Date() } });
    }
  });

  revalidatePath(`/crm/leads/${parsed.leadId}`);
}

export async function listLeadActivities(leadId: string) {
  const { organizationId } = await requirePermission("leadActivity.view");
  // Both leadId AND organizationId are filtered directly on LeadActivity
  // (organizationId is denormalized onto it precisely for this), plus the
  // Lead relation is also constrained by organizationId - an Org-B lead id
  // returns nothing rather than leaking Org A's activities.
  return prisma.leadActivity.findMany({
    where: { organizationId, leadId, lead: { organizationId } },
    orderBy: { activityDate: "desc" },
  });
}
