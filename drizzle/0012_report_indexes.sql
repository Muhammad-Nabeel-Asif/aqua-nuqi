-- Phase 8: indexes for P&L / sales / collection date-range scans.
CREATE INDEX IF NOT EXISTS `idx_invoices_issue_date` ON `invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invoices_period_status` ON `invoices` (`period`, `status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customer_adjustments_date` ON `customer_adjustments` (`adjustment_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stock_reason_date` ON `stock_movements` (`reason`, `movement_date`);
