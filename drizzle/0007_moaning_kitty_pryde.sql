CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`expense_date` text NOT NULL,
	`category_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`vendor_name` text,
	`description` text,
	`reference_no` text,
	`attachment_path` text,
	`employee_id` integer,
	`vehicle_id` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref_table` text,
	`source_ref_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_amount_check" CHECK("expenses"."amount" > 0),
	CONSTRAINT "expenses_payment_method_check" CHECK("expenses"."payment_method" IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','credit','other')),
	CONSTRAINT "expenses_source_check" CHECK("expenses"."source" IN ('manual','payroll','purchase','recurring')),
	CONSTRAINT "expenses_status_check" CHECK("expenses"."status" IN ('active','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_uuid_unique` ON `expenses` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_expenses_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_expenses_category` ON `expenses` (`category_id`,`expense_date`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer,
	`vendor_name` text,
	`next_due_date` text NOT NULL,
	`last_recorded_date` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_expenses_frequency_check" CHECK("recurring_expenses"."frequency" IN ('monthly','quarterly','yearly')),
	CONSTRAINT "recurring_expenses_is_active_check" CHECK("recurring_expenses"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_expenses_uuid_unique` ON `recurring_expenses` (`uuid`);
