# Service Invoices

Standalone tax invoices for services billed to a customer outside their
lease (cleaning, maintenance call-outs, admin fees...). Menu: **فواتير
الخدمات / Service Invoices** (`/service-invoices`). Report: **تقرير الخدمات
المقدمة / Services Provided Report** (`/reports/services`).

## What a service invoice is

- A normal `Invoice` row with `category = SERVICE` (rent/schedule invoices
  are `RENTAL`, the default - every pre-existing row migrated as `RENTAL`).
- Issued through the same `issueInvoice()` as rent invoices, so it shares
  the organization's single ICV counter, invoice numbering, PIH -> hash
  chain, QR and UBL XML. ZATCA requires one chain per seller, so service
  invoices are deliberately *not* a separate sequence.
- Never linked to a contract or payment schedule (`contractId` and
  `InvoiceLine.paymentScheduleId` are null), so it cannot change any
  schedule's status.
- `serviceId` points at the `ServiceCatalogItem` billed (SetNull - the line
  description is the permanent snapshot).

## Issuing

Pick customer (any `Renter`), service, quantity, amount before VAT, VAT
rate (defaults from the catalog item, editable) and payment method:

- `CASH` / `BANK_TRANSFER` / `CHEQUE` / `CARD` / `ONLINE`: a `Payment`
  (receipt) for the full total is posted in the same transaction and the
  invoice is `PAID`.
- `ON_ACCOUNT` (آجل): issued unpaid; payments are recorded later from the
  invoice page exactly like any other invoice.

Cancellation and payment reversal use the existing invoice/payment flows.

## Where service invoices appear

| Surface | Included? |
|---|---|
| Renter statement (`getRenterStatement`) - invoices and payments | No |
| Tenant portal outstanding balance / dashboard balance | No |
| Corporate housing account financial snapshot / report | No |
| Main tax invoices list (`/invoices`) | No - listed on `/service-invoices` |
| Services Provided report | Yes |
| VAT report | Yes (tax is owed on them) |
| Payments list, collections report, dashboard and executive totals | Yes (company-wide cash and revenue) |
| Tenant portal invoice list / detail | Yes (the customer can see their tax invoice) |
| Unit statement | No (it only reads contract-linked invoices) |

## Permissions

Reuses the existing invoice keys: `invoice.view` to see the list and the
catalog, `invoice.create` to issue invoices and manage the catalog,
`report.view` for the report.

## Not included

No communication events (`INVOICE_ISSUED` / `PAYMENT_RECEIVED`) are emitted
for service invoices yet; their templates assume contract/unit variables.
