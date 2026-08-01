-- Phase 6 review fixes: partial advance settlement without row split;
-- soft-supersede payroll_items instead of hard-delete on regenerate.
ALTER TABLE `salary_advances` ADD `settled_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_items` ADD `superseded_at` text;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_payroll_item_run_employee`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payroll_item_run_employee` ON `payroll_items` (`payroll_run_id`, `employee_id`) WHERE `superseded_at` IS NULL;
