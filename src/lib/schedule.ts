import { addMonths, isBefore } from "date-fns";
import type { Contract, PaymentFrequency, ExtraChargesMode } from "@prisma/client";
import { round2 } from "@/lib/zatca/vat";

const FREQUENCY_MONTHS: Record<PaymentFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
  ONE_TIME: 0,
};

export interface GeneratedInstallment {
  installmentNo: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  rentAmount: number;
  commissionAmount: number;
  cleaningAmount: number;
  securityDepositAmount: number;
  amount: number;
}

type ScheduleContract = Pick<
  Contract,
  | "startDate"
  | "endDate"
  | "rentAmount"
  | "paymentFrequency"
  | "commissionAmount"
  | "cleaningAmount"
  | "extraChargesMode"
  | "securityDeposit"
>;

/**
 * Splits a contract's term into billing installments. `contract.rentAmount`
 * is the amount due per installment at the chosen frequency (e.g. a
 * MONTHLY contract's rentAmount is the monthly rent, not the annual total).
 *
 * The one-off commission/cleaning fees are attached per `extraChargesMode`:
 * SPLIT divides each evenly across every rent installment; ONE_TIME appends
 * a single extra installment (rent = 0) due on the contract start date. The
 * security deposit, if any, is always its own separate one-time installment
 * (never split) since it's a distinct refundable amount, not a service fee.
 */
export function generateSchedule(contract: ScheduleContract): GeneratedInstallment[] {
  const rentAmount = Number(contract.rentAmount);
  const commissionTotal = Number(contract.commissionAmount ?? 0);
  const cleaningTotal = Number(contract.cleaningAmount ?? 0);
  const depositTotal = Number(contract.securityDeposit ?? 0);

  const rentInstallments = buildRentInstallments(contract, rentAmount);

  const installments =
    contract.extraChargesMode === "SPLIT" && rentInstallments.length > 0 && (commissionTotal > 0 || cleaningTotal > 0)
      ? splitExtraCharges(rentInstallments, commissionTotal, cleaningTotal)
      : commissionTotal > 0 || cleaningTotal > 0
        ? [
            ...rentInstallments,
            blankInstallment(rentInstallments.length + 1, contract.startDate, {
              commissionAmount: commissionTotal,
              cleaningAmount: cleaningTotal,
            }),
          ]
        : rentInstallments;

  if (depositTotal > 0) {
    installments.push(
      blankInstallment(installments.length + 1, contract.startDate, { securityDepositAmount: depositTotal })
    );
  }

  return installments;
}

function blankInstallment(
  installmentNo: number,
  date: Date,
  amounts: Partial<Pick<GeneratedInstallment, "commissionAmount" | "cleaningAmount" | "securityDepositAmount">>
): GeneratedInstallment {
  const commissionAmount = amounts.commissionAmount ?? 0;
  const cleaningAmount = amounts.cleaningAmount ?? 0;
  const securityDepositAmount = amounts.securityDepositAmount ?? 0;
  return {
    installmentNo,
    periodStart: date,
    periodEnd: date,
    dueDate: date,
    rentAmount: 0,
    commissionAmount,
    cleaningAmount,
    securityDepositAmount,
    amount: round2(commissionAmount + cleaningAmount + securityDepositAmount),
  };
}

function buildRentInstallments(
  contract: Pick<Contract, "startDate" | "endDate" | "paymentFrequency">,
  rentAmount: number
): GeneratedInstallment[] {
  if (contract.paymentFrequency === "ONE_TIME") {
    return [
      {
        installmentNo: 1,
        periodStart: contract.startDate,
        periodEnd: contract.endDate,
        dueDate: contract.startDate,
        rentAmount,
        commissionAmount: 0,
        cleaningAmount: 0,
        securityDepositAmount: 0,
        amount: rentAmount,
      },
    ];
  }

  const stepMonths = FREQUENCY_MONTHS[contract.paymentFrequency];
  const installments: GeneratedInstallment[] = [];
  let periodStart = contract.startDate;
  let installmentNo = 1;

  while (isBefore(periodStart, contract.endDate)) {
    const periodEnd = addMonths(periodStart, stepMonths);
    installments.push({
      installmentNo,
      periodStart,
      periodEnd: periodEnd > contract.endDate ? contract.endDate : periodEnd,
      dueDate: periodStart,
      rentAmount,
      commissionAmount: 0,
      cleaningAmount: 0,
      securityDepositAmount: 0,
      amount: rentAmount,
    });
    periodStart = periodEnd;
    installmentNo += 1;
  }

  return installments;
}

function splitExtraCharges(
  installments: GeneratedInstallment[],
  commissionTotal: number,
  cleaningTotal: number
): GeneratedInstallment[] {
  const count = installments.length;
  const commissionPer = round2(commissionTotal / count);
  const cleaningPer = round2(cleaningTotal / count);

  return installments.map((inst, idx) => {
    // Put any rounding remainder on the last installment so the parts sum
    // exactly to the contract totals.
    const isLast = idx === count - 1;
    const commissionAmount = isLast ? round2(commissionTotal - commissionPer * (count - 1)) : commissionPer;
    const cleaningAmount = isLast ? round2(cleaningTotal - cleaningPer * (count - 1)) : cleaningPer;
    return {
      ...inst,
      commissionAmount,
      cleaningAmount,
      amount: round2(inst.rentAmount + commissionAmount + cleaningAmount),
    };
  });
}

export type { ExtraChargesMode };
