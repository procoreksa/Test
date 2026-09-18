import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildUblInvoiceXml } from "@/lib/zatca/ubl";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id, organizationId: session.user.organizationId },
    include: { lines: true, renter: true, organization: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const xml = buildUblInvoiceXml({
    uuid: invoice.uuid,
    invoiceNumber: invoice.invoiceNumber,
    icv: invoice.icv,
    documentTypeCode: "388",
    isSimplified: invoice.kind === "SIMPLIFIED",
    issueDateIso: invoice.issueDate.toISOString(),
    currency: invoice.currency,
    seller: {
      name: invoice.organization.name,
      vatNumber: invoice.organization.vatNumber ?? "",
      street: invoice.organization.street,
      city: invoice.organization.city,
      district: invoice.organization.district,
      buildingNumber: invoice.organization.buildingNumber,
      postalCode: invoice.organization.postalCode,
      country: invoice.organization.country,
    },
    buyer: {
      name: invoice.renter.fullName,
      vatNumber: invoice.renter.vatNumber,
    },
    lines: invoice.lines.map((line, idx) => ({
      id: idx + 1,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      vatRate: Number(line.vatRate),
      vatAmount: Number(line.vatAmount),
      lineTotal: Number(line.lineTotal),
      taxableAmount: Number(line.lineTotal) - Number(line.vatAmount),
    })),
    subtotal: Number(invoice.subtotal),
    vatAmount: Number(invoice.vatAmount),
    totalAmount: Number(invoice.totalAmount),
    previousInvoiceHash: invoice.previousInvoiceHash ?? "",
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.xml"`,
    },
  });
}
