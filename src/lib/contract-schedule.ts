import type { Contract, Prisma, PrismaClient, PaymentFrequency, ExtraChargesMode } from "@prisma/client";
import { nextCounterValue, formatContractNumber } from "@/lib/numbering";
import { generateSchedule } from "@/lib/schedule";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ContractInput {
  unitId: string;
  renterId: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  paymentFrequency: PaymentFrequency;
  securityDeposit?: number;
  commissionAmount?: number;
  cleaningAmount?: number;
  extraChargesMode: ExtraChargesMode;
  vatApplicable: boolean;
  notes?: string;
}

/**
 * Creates a contract, generates its full payment schedule (rent + optional
 * commission/cleaning/security-deposit installments), and marks the unit
 * occupied. Shared by both the "new contract" and "renew contract" flows.
 */
export async function createContractWithSchedule(tx: Tx, organizationId: string, input: ContractInput) {
  const seq = await nextCounterValue(tx, organizationId, "contract");
  const contractNumber = formatContractNumber(seq, new Date().getFullYear());

  const contract = await tx.contract.create({
    data: {
      organizationId,
      contractNumber,
      unitId: input.unitId,
      renterId: input.renterId,
      startDate: input.startDate,
      endDate: input.endDate,
      rentAmount: input.rentAmount,
      paymentFrequency: input.paymentFrequency,
      securityDeposit: input.securityDeposit,
      commissionAmount: input.commissionAmount,
      cleaningAmount: input.cleaningAmount,
      extraChargesMode: input.extraChargesMode,
      vatApplicable: input.vatApplicable,
      vatRate: input.vatApplicable ? 15 : 0,
      status: "ACTIVE",
      notes: input.notes,
    },
  });

  await generateAndCreateSchedule(tx, organizationId, contract);
  await tx.unit.update({ where: { id: input.unitId }, data: { status: "OCCUPIED" } });

  return contract;
}

type ScheduleSourceContract = Pick<
  Contract,
  "id" | "startDate" | "endDate" | "rentAmount" | "paymentFrequency" | "commissionAmount" | "cleaningAmount" | "extraChargesMode" | "securityDeposit"
>;

/** (Re)generates a contract's payment schedule rows. Caller is responsible for removing any prior rows first. */
export async function generateAndCreateSchedule(tx: Tx, organizationId: string, contract: ScheduleSourceContract) {
  const installments = generateSchedule(contract);
  await tx.paymentSchedule.createMany({
    data: installments.map((i) => ({
      organizationId,
      contractId: contract.id,
      installmentNo: i.installmentNo,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      dueDate: i.dueDate,
      rentAmount: i.rentAmount,
      commissionAmount: i.commissionAmount,
      cleaningAmount: i.cleaningAmount,
      securityDepositAmount: i.securityDepositAmount,
      amount: i.amount,
    })),
  });
}
