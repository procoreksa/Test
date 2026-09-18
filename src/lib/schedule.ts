import { addMonths, isBefore } from "date-fns";
import type { Contract, PaymentFrequency } from "@prisma/client";

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
  amount: number;
}

/**
 * Splits a contract's term into billing installments. `contract.rentAmount`
 * is the amount due per installment at the chosen frequency (e.g. a
 * MONTHLY contract's rentAmount is the monthly rent, not the annual total).
 */
export function generateSchedule(
  contract: Pick<Contract, "startDate" | "endDate" | "rentAmount" | "paymentFrequency">
): GeneratedInstallment[] {
  const rentAmount = Number(contract.rentAmount);

  if (contract.paymentFrequency === "ONE_TIME") {
    return [
      {
        installmentNo: 1,
        periodStart: contract.startDate,
        periodEnd: contract.endDate,
        dueDate: contract.startDate,
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
      amount: rentAmount,
    });
    periodStart = periodEnd;
    installmentNo += 1;
  }

  return installments;
}
