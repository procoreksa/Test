"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { nextCounterValue, formatContractNumber } from "@/lib/numbering";
import { generateSchedule } from "@/lib/schedule";
import { getLocale, getDictionary } from "@/lib/i18n";

function contractSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    unitId: z.string().min(1),
    renterId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    rentAmount: z.coerce.number().positive(t.validation.installmentAmountPositive),
    paymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_TIME"]),
    securityDeposit: z.coerce.number().optional(),
    vatApplicable: z.coerce.boolean().optional(),
    notes: z.string().optional(),
  });
}

export async function createContract(formData: FormData) {
  const organizationId = await requireOrgId();
  const t = getDictionary(await getLocale());
  const parsed = contractSchema(t).parse({
    unitId: formData.get("unitId"),
    renterId: formData.get("renterId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount"),
    paymentFrequency: formData.get("paymentFrequency"),
    securityDeposit: formData.get("securityDeposit") || undefined,
    vatApplicable: formData.get("vatApplicable") === "on",
    notes: formData.get("notes") || undefined,
  });

  if (parsed.endDate <= parsed.startDate) {
    throw new Error(t.validation.contractEndAfterStart);
  }

  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
    const seq = await nextCounterValue(tx, organizationId, "contract");
    const contractNumber = formatContractNumber(seq, new Date().getFullYear());
    const vatApplicable = parsed.vatApplicable ?? unit.vatApplicable;

    const contract = await tx.contract.create({
      data: {
        organizationId,
        contractNumber,
        unitId: parsed.unitId,
        renterId: parsed.renterId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        rentAmount: parsed.rentAmount,
        paymentFrequency: parsed.paymentFrequency,
        securityDeposit: parsed.securityDeposit,
        vatApplicable,
        vatRate: vatApplicable ? 15 : 0,
        status: "ACTIVE",
        notes: parsed.notes,
      },
    });

    const installments = generateSchedule(contract);
    await tx.paymentSchedule.createMany({
      data: installments.map((i) => ({
        organizationId,
        contractId: contract.id,
        installmentNo: i.installmentNo,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        dueDate: i.dueDate,
        amount: i.amount,
      })),
    });

    await tx.unit.update({ where: { id: parsed.unitId }, data: { status: "OCCUPIED" } });
  });

  revalidatePath("/contracts");
  revalidatePath("/units");
}

export async function terminateContract(contractId: string) {
  const organizationId = await requireOrgId();
  await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.update({
      where: { id: contractId, organizationId },
      data: { status: "TERMINATED" },
    });
    await tx.paymentSchedule.updateMany({
      where: { contractId, organizationId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.unit.update({ where: { id: contract.unitId }, data: { status: "VACANT" } });
  });
  revalidatePath("/contracts");
  revalidatePath("/units");
}

export async function listContracts() {
  const organizationId = await requireOrgId();
  return prisma.contract.findMany({
    where: { organizationId },
    include: { unit: { include: { property: true } }, renter: true, paymentSchedules: true },
    orderBy: { createdAt: "desc" },
  });
}
