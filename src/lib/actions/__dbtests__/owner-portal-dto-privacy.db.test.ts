/**
 * Real, database-backed DTO-minimization tests for the Owner Portal
 * (docs/OWNER-PORTAL.md, "Tenant privacy" / "Owner-safe DTOs"). These test
 * the actual shape of the data returned by the owner-safe query layer -
 * never just what a page happens to render - proving the disallowed fields
 * are absent from the object itself, not merely unrendered.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, createTestUnit, type SeededOrg } from "./db-test-helpers";
import { createTestOwnerPortalAccount, ownerSessionFor } from "./owner-portal-test-helpers";
import { prisma } from "@/lib/prisma";
import { createContractWithSchedule } from "@/lib/contract-schedule";

const mockOwnerAuth = vi.fn();
vi.mock("@/lib/owner-auth", () => ({ auth: () => mockOwnerAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("OWNDTO");
});

describe("Tenant-PII minimization: the owner-facing Contract DTO omits every disallowed Renter field", () => {
  it("a Renter with national ID/phone/email/address/VAT number produces a Contract DTO exposing only fullName/fullNameAr", async () => {
    const owner = await createTestOwner(org.organization.id, "PII Test Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id);
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `PII-${Date.now()}` });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 } });

    const renter = await prisma.renter.create({
      data: {
        organizationId: org.organization.id,
        fullName: "Sensitive Renter",
        fullNameAr: "مستأجر حساس",
        idType: "NATIONAL_ID",
        idNumber: "1234567890",
        phone: "0501112222",
        email: "sensitive-renter@example.com",
        address: "123 Private Street",
        vatNumber: "300000000000099",
      },
    });
    const contract = await createContractWithSchedule(prisma, org.organization.id, {
      unitId: unit.id,
      renterId: renter.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      rentAmount: 50000,
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
      vatApplicable: false,
    });

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(account));
    const { getOwnerPortalContracts, getOwnerPortalContractDetail } = await import("@/lib/actions/owner-portal/contracts");

    const list = await getOwnerPortalContracts();
    const row = list.find((c) => c.id === contract.id);
    expect(row).toBeDefined();
    expect(Object.keys(row!.renter).sort()).toEqual(["fullName", "fullNameAr"]);

    const detail = await getOwnerPortalContractDetail(contract.id);
    expect(Object.keys(detail.renter).sort()).toEqual(["fullName", "fullNameAr"]);
    expect(detail.renter.fullName).toBe("Sensitive Renter");
    // The disallowed fields must be structurally absent, not merely unrendered.
    expect("idNumber" in detail.renter).toBe(false);
    expect("phone" in detail.renter).toBe(false);
    expect("email" in detail.renter).toBe(false);
    expect("address" in detail.renter).toBe(false);
    expect("vatNumber" in detail.renter).toBe(false);
  });
});

describe("Maintenance-privacy minimization: internal notes, vendor detail, and tenant contact info are structurally absent", () => {
  it("a request with internal triage notes/tenant phone and a work order with a vendor/diagnosis/verification notes exposes only the owner-safe field list", async () => {
    const owner = await createTestOwner(org.organization.id, "Maintenance Privacy Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id);
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `MaintPriv-${Date.now()}` });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 } });

    const vendor = await prisma.maintenanceVendor.create({ data: { organizationId: org.organization.id, vendorNumber: `VEN-DTOPRIV-${Date.now()}`, name: "Confidential Vendor Co", phone: "0509998888" } });

    const request = await prisma.maintenanceRequest.create({
      data: {
        organizationId: org.organization.id,
        requestNumber: `MR-DTOPRIV-${Date.now()}`,
        scopeType: "UNIT",
        unitId: unit.id,
        category: "PLUMBING",
        priority: "NORMAL",
        status: "RESOLVED",
        title: "Leaking tap",
        description: "Owner-visible description",
        reportedByType: "TENANT",
        reportedByName: "Confidential Tenant Name",
        reportedByPhone: "0501234999",
        triageNotes: "Internal staff triage notes - never owner-visible",
        source: "TENANT",
        resolvedAt: new Date(),
        createdByUserId: org.admin.id,
      },
    });

    await prisma.maintenanceWorkOrder.create({
      data: {
        organizationId: org.organization.id,
        workOrderNumber: `WO-DTOPRIV-${Date.now()}`,
        requestId: request.id,
        status: "CLOSED",
        priority: "NORMAL",
        vendorId: vendor.id,
        diagnosis: "Confidential internal diagnosis",
        workPerformed: "Confidential internal work log",
        verificationNotes: "Confidential internal verification notes",
        estimatedCost: 500,
        actualCost: 450,
        costResponsibility: "OWNER",
        completedAt: new Date(),
        createdByUserId: org.admin.id,
      },
    });

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(account));
    const { getOwnerPortalMaintenanceRequestDetail } = await import("@/lib/actions/owner-portal/maintenance");
    const { request: dto } = await getOwnerPortalMaintenanceRequestDetail(request.id);

    // Owner-safe fields are present.
    expect(dto.requestNumber).toBe(request.requestNumber);
    expect(dto.description).toBe("Owner-visible description");

    // Internal/tenant-contact fields are structurally absent from the DTO.
    for (const forbidden of ["reportedByName", "reportedByPhone", "triageNotes", "reportedByUserId", "assignedToUserId", "renterId", "renter", "cancelReasonNote"]) {
      expect(forbidden in dto).toBe(false);
    }

    expect(dto.workOrders).toHaveLength(1);
    const workOrder = dto.workOrders[0];
    expect(Object.keys(workOrder).sort()).toEqual(["actualCost", "completedAt", "costResponsibility", "status"]);
    expect(Number(workOrder.actualCost)).toBe(450);
    for (const forbidden of ["vendorId", "vendor", "diagnosis", "workPerformed", "verificationNotes", "assignedToUserId", "estimatedCost"]) {
      expect(forbidden in workOrder).toBe(false);
    }
  });
});
