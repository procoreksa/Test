-- Hardening pass (docs/PERFORMANCE-REVIEW.md, "Dashboard query audit").
-- Purely additive: one new index, no existing column/table/constraint
-- touched. Supports getDashboardStats()'s monthly invoiced/collected
-- trend query, which now filters by organizationId + a bounded issueDate
-- window instead of scanning the organization's entire invoice history.

-- CreateIndex
CREATE INDEX "invoices_organizationId_issueDate_idx" ON "invoices"("organizationId", "issueDate");
