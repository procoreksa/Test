import type { PaymentFrequency } from "@prisma/client";

/** How many installments a contract's payment frequency produces per year - used to project an annual rent figure for reports. */
export const INSTALLMENTS_PER_YEAR: Record<PaymentFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
  ONE_TIME: 1,
};
