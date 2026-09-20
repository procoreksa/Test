import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateSchedule } from "@/lib/schedule";
import { nextCounterValue, formatContractNumber } from "@/lib/numbering";
import { issueInvoice } from "@/lib/invoicing";

/**
 * Idempotent demo dataset (org, admin user, properties, contracts, one paid
 * invoice). Shared by the CLI seed script (`npm run db:seed`) and the
 * protected `/api/admin/seed` route, which exists so this can be triggered
 * against a deployed database without local Postgres network access.
 */
export async function seedDemoData() {
  const passwordHash = await bcrypt.hash("Passw0rd!", 10);

  const org = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: {
      id: "demo-org",
      name: "Demo Real Estate Co.",
      nameAr: "شركة الديار العقارية التجريبية",
      commercialRegistration: "1010123456",
      vatNumber: "300012345600003",
      country: "SA",
      city: "الرياض",
      district: "العليا",
      street: "طريق الملك فهد",
      buildingNumber: "1234",
      postalCode: "12345",
      phone: "+966500000000",
      email: "info@demo-realestate.sa",
      subscriptionPlan: "PRO",
    },
  });

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "admin@demo-realestate.sa" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Yousef Al-Harbi",
      email: "admin@demo-realestate.sa",
      passwordHash,
      role: "OWNER",
    },
  });

  const property = await prisma.property.upsert({
    where: { id: "demo-property" },
    update: {},
    create: {
      id: "demo-property",
      organizationId: org.id,
      name: "Al Yasmin Tower",
      nameAr: "برج الياسمين",
      propertyType: "MIXED",
      city: "الرياض",
      district: "الياسمين",
      street: "شارع الأمير سلطان",
    },
  });

  const residentialUnit = await prisma.unit.upsert({
    where: { id: "demo-unit-res" },
    update: {},
    create: {
      id: "demo-unit-res",
      organizationId: org.id,
      propertyId: property.id,
      unitNumber: "A-101",
      floor: "1",
      unitType: "APARTMENT",
      areaSqm: 120,
      bedrooms: 3,
      bathrooms: 2,
      baseRentAmount: 3500,
      vatApplicable: false,
      status: "VACANT",
    },
  });

  const commercialUnit = await prisma.unit.upsert({
    where: { id: "demo-unit-com" },
    update: {},
    create: {
      id: "demo-unit-com",
      organizationId: org.id,
      propertyId: property.id,
      unitNumber: "G-01",
      floor: "0",
      unitType: "SHOP",
      areaSqm: 80,
      baseRentAmount: 8000,
      vatApplicable: true,
      status: "VACANT",
    },
  });

  const individualRenter = await prisma.renter.upsert({
    where: { id: "demo-renter-individual" },
    update: {},
    create: {
      id: "demo-renter-individual",
      organizationId: org.id,
      fullName: "Mohammed Al-Otaibi",
      fullNameAr: "محمد العتيبي",
      idType: "NATIONAL_ID",
      idNumber: "1023456789",
      phone: "+966511111111",
      email: "mohammed@example.com",
    },
  });

  const businessRenter = await prisma.renter.upsert({
    where: { id: "demo-renter-business" },
    update: {},
    create: {
      id: "demo-renter-business",
      organizationId: org.id,
      fullName: "Falcon Trading Est.",
      fullNameAr: "مؤسسة الصقر التجارية",
      idType: "COMMERCIAL_REGISTRATION",
      idNumber: "4030112233",
      vatNumber: "300098765400003",
      phone: "+966522222222",
      email: "billing@falcon-trading.sa",
    },
  });

  async function ensureContract(opts: {
    id: string;
    unitId: string;
    renterId: string;
    rentAmount: number;
    vatApplicable: boolean;
    paymentFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  }) {
    const existing = await prisma.contract.findUnique({ where: { id: opts.id } });
    if (existing) return existing;

    const seq = await nextCounterValue(prisma, org.id, "contract");
    const contract = await prisma.contract.create({
      data: {
        id: opts.id,
        organizationId: org.id,
        contractNumber: formatContractNumber(seq, new Date().getFullYear()),
        unitId: opts.unitId,
        renterId: opts.renterId,
        startDate: new Date(new Date().getFullYear(), 0, 1),
        endDate: new Date(new Date().getFullYear() + 1, 0, 1),
        rentAmount: opts.rentAmount,
        paymentFrequency: opts.paymentFrequency,
        vatApplicable: opts.vatApplicable,
        vatRate: opts.vatApplicable ? 15 : 0,
        status: "ACTIVE",
      },
    });

    const installments = generateSchedule(contract);
    await prisma.paymentSchedule.createMany({
      data: installments.map((i) => ({
        organizationId: org.id,
        contractId: contract.id,
        installmentNo: i.installmentNo,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        dueDate: i.dueDate,
        rentAmount: i.rentAmount,
        commissionAmount: i.commissionAmount,
        cleaningAmount: i.cleaningAmount,
        amount: i.amount,
      })),
    });

    await prisma.unit.update({ where: { id: opts.unitId }, data: { status: "OCCUPIED" } });
    return contract;
  }

  const residentialContract = await ensureContract({
    id: "demo-contract-res",
    unitId: residentialUnit.id,
    renterId: individualRenter.id,
    rentAmount: 3500,
    vatApplicable: false,
    paymentFrequency: "MONTHLY",
  });

  await ensureContract({
    id: "demo-contract-com",
    unitId: commercialUnit.id,
    renterId: businessRenter.id,
    rentAmount: 8000,
    vatApplicable: true,
    paymentFrequency: "QUARTERLY",
  });

  const existingInvoice = await prisma.invoice.findFirst({ where: { organizationId: org.id } });
  if (!existingInvoice) {
    const firstSchedule = await prisma.paymentSchedule.findFirstOrThrow({
      where: { contractId: residentialContract.id },
      orderBy: { installmentNo: "asc" },
    });

    const invoice = await issueInvoice({
      organizationId: org.id,
      renterId: individualRenter.id,
      contractId: residentialContract.id,
      paymentScheduleId: firstSchedule.id,
      dueDate: firstSchedule.dueDate,
      lines: [
        {
          description: "Rent - Al Yasmin Tower / Unit A-101 (January)",
          descriptionAr: "إيجار - برج الياسمين / وحدة A-101 (يناير)",
          periodStart: firstSchedule.periodStart,
          periodEnd: firstSchedule.periodEnd,
          quantity: 1,
          unitPrice: 3500,
          vatRate: 0,
          kind: "RENT",
        },
      ],
    });

    await prisma.payment.create({
      data: {
        organizationId: org.id,
        invoiceId: invoice.id,
        renterId: individualRenter.id,
        receiptNumber: "RCT-DEMO-000001",
        amount: 3500,
        method: "BANK_TRANSFER",
        referenceNumber: "SEED-DEMO",
      },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 3500, status: "PAID" } });
    await prisma.paymentSchedule.update({ where: { id: firstSchedule.id }, data: { status: "PAID" } });
  }

  return { organizationId: org.id };
}
