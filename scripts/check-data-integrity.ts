/**
 * Read-only production data integrity checker (hardening Step 52,
 * docs/SECURITY-REVIEW.md / docs/TECHNICAL-DEBT.md). Run with:
 *
 *   npx tsx scripts/check-data-integrity.ts
 *
 * This script NEVER writes to the database - it only reads and reports.
 * Every check below is something the application's own transactions and
 * constraints are designed to prevent, so a clean run is the expected,
 * normal result; a non-empty finding means either a real bug slipped
 * through, or (more commonly in a long-lived system) a legacy row from
 * before a given invariant existed. Investigate before ever hand-editing
 * data based on this report - it deliberately does not attempt to repair
 * anything itself.
 */
import { prisma } from "../src/lib/prisma";
import { Prisma } from "@prisma/client";

interface Finding {
  check: string;
  count: number;
  sample: unknown[];
}

const findings: Finding[] = [];

async function report(check: string, rows: unknown[]) {
  if (rows.length > 0) findings.push({ check, count: rows.length, sample: rows.slice(0, 5) });
}

async function main() {
  // 1. Cross-org relation leakage: a Contract whose Unit or Renter belongs
  // to a different organization than the Contract itself (the exact class
  // of bug fixed in src/lib/actions/contracts.ts during the hardening
  // pass - see docs/SECURITY-REVIEW.md).
  const crossOrgContracts = await prisma.$queryRaw<Array<{ id: string; contractNumber: string }>>(Prisma.sql`
    SELECT c.id, c."contractNumber"
    FROM contracts c
    JOIN units u ON u.id = c."unitId"
    JOIN renters r ON r.id = c."renterId"
    WHERE c."organizationId" != u."organizationId" OR c."organizationId" != r."organizationId"
  `);
  await report("Contract with cross-org Unit/Renter", crossOrgContracts);

  // 2. Unit.status = OCCUPIED with no ACTIVE contract at all.
  const occupiedNoContract = await prisma.$queryRaw<Array<{ id: string; unitNumber: string }>>(Prisma.sql`
    SELECT u.id, u."unitNumber"
    FROM units u
    WHERE u.status = 'OCCUPIED'
      AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c."unitId" = u.id AND c.status = 'ACTIVE')
  `);
  await report("Unit OCCUPIED with no ACTIVE contract", occupiedNoContract);

  // 3. An ACTIVE contract whose Unit is not OCCUPIED (VACANT/RESERVED/MAINTENANCE drift).
  const activeContractWrongUnitStatus = await prisma.$queryRaw<Array<{ id: string; contractNumber: string; unitStatus: string }>>(Prisma.sql`
    SELECT c.id, c."contractNumber", u.status as "unitStatus"
    FROM contracts c
    JOIN units u ON u.id = c."unitId"
    WHERE c.status = 'ACTIVE' AND u.status != 'OCCUPIED'
  `);
  await report("ACTIVE contract whose Unit is not OCCUPIED", activeContractWrongUnitStatus);

  // 4. More than one ACTIVE contract on the same Unit at once.
  const multipleActiveContracts = await prisma.$queryRaw<Array<{ unitId: string; activeCount: bigint }>>(Prisma.sql`
    SELECT "unitId", COUNT(*) as "activeCount"
    FROM contracts
    WHERE status = 'ACTIVE'
    GROUP BY "unitId"
    HAVING COUNT(*) > 1
  `);
  await report("Unit with more than one ACTIVE contract", multipleActiveContracts.map((r) => ({ ...r, activeCount: Number(r.activeCount) })));

  // 5. Reservation marked CONVERTED_TO_CONTRACT with no matching Contract.
  const convertedNoContract = await prisma.reservation.findMany({
    where: { status: "CONVERTED_TO_CONTRACT", convertedContract: null },
    select: { id: true, reservationNumber: true },
  });
  await report("Reservation CONVERTED_TO_CONTRACT with no linked Contract", convertedNoContract);

  // 6. Contract linked to a Reservation that itself isn't CONVERTED_TO_CONTRACT.
  const contractReservationMismatch = await prisma.contract.findMany({
    where: { reservationId: { not: null }, reservation: { status: { not: "CONVERTED_TO_CONTRACT" } } },
    select: { id: true, contractNumber: true, reservation: { select: { id: true, status: true } } },
  });
  await report("Contract linked to a Reservation not in CONVERTED_TO_CONTRACT status", contractReservationMismatch);

  // 7. Completed Move-In whose Contract/Unit/Renter organization diverges from its own.
  const moveInOrgMismatch = await prisma.$queryRaw<Array<{ id: string; moveInNumber: string }>>(Prisma.sql`
    SELECT m.id, m."moveInNumber"
    FROM move_ins m
    JOIN contracts c ON c.id = m."contractId"
    JOIN units u ON u.id = m."unitId"
    JOIN renters r ON r.id = m."renterId"
    WHERE m."organizationId" != c."organizationId" OR m."organizationId" != u."organizationId" OR m."organizationId" != r."organizationId"
  `);
  await report("Move-In with cross-org Contract/Unit/Renter", moveInOrgMismatch);

  // 8. More than one non-CANCELLED Move-In for the same Contract (the
  // invariant blocksNewMoveInForContract() is designed to enforce).
  const multipleActiveMoveIns = await prisma.$queryRaw<Array<{ contractId: string; activeCount: bigint }>>(Prisma.sql`
    SELECT "contractId", COUNT(*) as "activeCount"
    FROM move_ins
    WHERE status != 'CANCELLED'
    GROUP BY "contractId"
    HAVING COUNT(*) > 1
  `);
  await report("Contract with more than one active/completed Move-In", multipleActiveMoveIns.map((r) => ({ ...r, activeCount: Number(r.activeCount) })));

  // 9. Ownership totals exceeding 100% for any single asset (compound/building/unit).
  const ownershipOver100 = await prisma.$queryRaw<Array<{ assetKey: string; total: Prisma.Decimal }>>(Prisma.sql`
    SELECT COALESCE("compoundId", "buildingId", "unitId") as "assetKey", SUM("ownershipPercentage") as total
    FROM property_ownerships
    WHERE status = 'ACTIVE'
    GROUP BY COALESCE("compoundId", "buildingId", "unitId")
    HAVING SUM("ownershipPercentage") > 100
  `);
  await report("Asset with total ACTIVE ownership over 100%", ownershipOver100.map((r) => ({ ...r, total: r.total.toString() })));

  // 10. Invoice.paidAmount greater than Invoice.totalAmount (should never happen - payments are capped at the remaining balance).
  const overpaidInvoices = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string }>>(Prisma.sql`
    SELECT id, "invoiceNumber" FROM invoices WHERE "paidAmount" > "totalAmount"
  `);
  await report("Invoice with paidAmount exceeding totalAmount", overpaidInvoices);

  // 11. A Payment marked REVERSED with no reversal record pointing back to it, or vice versa.
  const orphanReversals = await prisma.$queryRaw<Array<{ id: string; receiptNumber: string }>>(Prisma.sql`
    SELECT id, "receiptNumber" FROM payments
    WHERE status = 'REVERSED' AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2."reversalOfPaymentId" = payments.id)
  `);
  await report("Payment marked REVERSED with no matching reversal record", orphanReversals);

  // --- Report ---
  if (findings.length === 0) {
    console.log("Data integrity check: no issues found.");
    return;
  }

  console.log(`Data integrity check: ${findings.length} finding type(s).\n`);
  for (const f of findings) {
    console.log(`--- ${f.check} (${f.count} row(s)) ---`);
    console.log(JSON.stringify(f.sample, null, 2));
    console.log();
  }
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
