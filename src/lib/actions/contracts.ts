"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { createContractWithSchedule } from "@/lib/contract-schedule";
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
    commissionAmount: z.coerce.number().min(0).optional(),
    cleaningAmount: z.coerce.number().min(0).optional(),
    extraChargesMode: z.enum(["ONE_TIME", "SPLIT"]),
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
    commissionAmount: formData.get("commissionAmount") || undefined,
    cleaningAmount: formData.get("cleaningAmount") || undefined,
    extraChargesMode: formData.get("extraChargesMode") || "ONE_TIME",
    vatApplicable: formData.get("vatApplicable") === "on",
    notes: formData.get("notes") || undefined,
  });

  if (parsed.endDate <= parsed.startDate) {
    throw new Error(t.validation.contractEndAfterStart);
  }

  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
    const vatApplicable = parsed.vatApplicable ?? unit.vatApplicable;
    await createContractWithSchedule(tx, organizationId, { ...parsed, vatApplicable });
  });

  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");
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
  revalidatePath("/dashboard");
}

function renewContractSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    contractId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    rentAmount: z.coerce.number().positive(t.validation.installmentAmountPositive),
    paymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_TIME"]),
    securityDeposit: z.coerce.number().optional(),
    commissionAmount: z.coerce.number().min(0).optional(),
    cleaningAmount: z.coerce.number().min(0).optional(),
    extraChargesMode: z.enum(["ONE_TIME", "SPLIT"]),
    vatApplicable: z.coerce.boolean().optional(),
    notes: z.string().optional(),
  });
}

export async function renewContract(formData: FormData) {
  const organizationId = await requireOrgId();
  const t = getDictionary(await getLocale());
  const parsed = renewContractSchema(t).parse({
    contractId: formData.get("contractId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount"),
    paymentFrequency: formData.get("paymentFrequency"),
    securityDeposit: formData.get("securityDeposit") || undefined,
    commissionAmount: formData.get("commissionAmount") || undefined,
    cleaningAmount: formData.get("cleaningAmount") || undefined,
    extraChargesMode: formData.get("extraChargesMode") || "ONE_TIME",
    vatApplicable: formData.get("vatApplicable") === "on",
    notes: formData.get("notes") || undefined,
  });

  if (parsed.endDate <= parsed.startDate) {
    throw new Error(t.validation.contractEndAfterStart);
  }

  await prisma.$transaction(async (tx) => {
    const oldContract = await tx.contract.findUniqueOrThrow({
      where: { id: parsed.contractId, organizationId },
    });

    await tx.contract.update({ where: { id: oldContract.id }, data: { status: "RENEWED" } });
    await tx.paymentSchedule.updateMany({
      where: { contractId: oldContract.id, organizationId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    await createContractWithSchedule(tx, organizationId, {
      unitId: oldContract.unitId,
      renterId: oldContract.renterId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      rentAmount: parsed.rentAmount,
      paymentFrequency: parsed.paymentFrequency,
      securityDeposit: parsed.securityDeposit,
      commissionAmount: parsed.commissionAmount,
      cleaningAmount: parsed.cleaningAmount,
      extraChargesMode: parsed.extraChargesMode,
      vatApplicable: parsed.vatApplicable ?? oldContract.vatApplicable,
      notes: parsed.notes,
    });
  });

  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  redirect("/contracts");
}

export async function getContractById(contractId: string) {
  const organizationId = await requireOrgId();
  return prisma.contract.findUniqueOrThrow({
    where: { id: contractId, organizationId },
    include: { unit: { include: { property: true } }, renter: true },
  });
}

export async function listContracts() {
  const organizationId = await requireOrgId();
  return prisma.contract.findMany({
    where: { organizationId },
    include: { unit: { include: { property: true } }, renter: true, paymentSchedules: true },
    orderBy: { createdAt: "desc" },
  });
}
