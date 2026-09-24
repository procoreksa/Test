-- Executive Dashboards (docs/EXECUTIVE-DASHBOARDS.md): three additive,
-- non-breaking indexes supporting the new bounded aggregate queries in
-- src/lib/executive/*.ts. No column or table changes - index-only.

-- CreateIndex
CREATE INDEX "units_organizationId_status_idx" ON "units"("organizationId", "status");

-- CreateIndex
CREATE INDEX "contracts_organizationId_status_endDate_idx" ON "contracts"("organizationId", "status", "endDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_status_dueDate_idx" ON "invoices"("organizationId", "status", "dueDate");
