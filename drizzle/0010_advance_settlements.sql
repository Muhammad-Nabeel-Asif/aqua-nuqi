-- Per-payroll-item advance settlement ledger so multi-month caps void correctly.
CREATE TABLE `salary_advance_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`salary_advance_id` integer NOT NULL,
	`payroll_item_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`salary_advance_id`) REFERENCES `salary_advances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payroll_item_id`) REFERENCES `payroll_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "salary_advance_settlements_amount_check" CHECK("amount" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX `salary_advance_settlements_uuid_unique` ON `salary_advance_settlements` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_adv_settlements_item` ON `salary_advance_settlements` (`payroll_item_id`);--> statement-breakpoint
CREATE INDEX `idx_adv_settlements_advance` ON `salary_advance_settlements` (`salary_advance_id`);
