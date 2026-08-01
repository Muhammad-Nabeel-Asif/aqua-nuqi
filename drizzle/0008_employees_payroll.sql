CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`cnic` text,
	`address` text,
	`photo_path` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`role` text DEFAULT 'delivery' NOT NULL,
	`joining_date` text,
	`leaving_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "employees_role_check" CHECK("role" IN ('delivery','plant','admin','other')),
	CONSTRAINT "employees_status_check" CHECK("status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_uuid_unique` ON `employees` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_code_unique` ON `employees` (`code`);--> statement-breakpoint
CREATE TABLE `employee_salaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`employee_id` integer NOT NULL,
	`salary_type` text NOT NULL,
	`base_amount` integer DEFAULT 0 NOT NULL,
	`commission_per_bottle` integer DEFAULT 0 NOT NULL,
	`overtime_hourly_rate` integer DEFAULT 0 NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`reason` text,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "employee_salaries_salary_type_check" CHECK("salary_type" IN ('monthly','daily','monthly_plus_commission','commission_only'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_salaries_uuid_unique` ON `employee_salaries` (`uuid`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`attendance_date` text NOT NULL,
	`status` text NOT NULL,
	`overtime_hours` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attendance_status_check" CHECK("status" IN ('present','absent','half_day','paid_leave','unpaid_leave','holiday'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attendance_employee_date` ON `attendance` (`employee_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_date` ON `attendance` (`attendance_date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_routes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`area_id` integer,
	`default_employee_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "routes_is_active_check" CHECK("is_active" IN (0,1))
);--> statement-breakpoint
INSERT INTO `__new_routes`(`id`, `uuid`, `name`, `area_id`, `default_employee_id`, `sort_order`, `notes`, `is_active`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `uuid`, `name`, `area_id`, `default_employee_id`, `sort_order`, `notes`, `is_active`, `created_at`, `updated_at`, `deleted_at` FROM `routes`;--> statement-breakpoint
DROP TABLE `routes`;--> statement-breakpoint
ALTER TABLE `__new_routes` RENAME TO `routes`;--> statement-breakpoint
CREATE UNIQUE INDEX `routes_uuid_unique` ON `routes` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `routes_name_unique` ON `routes` (`name`);--> statement-breakpoint
CREATE TABLE `__new_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`customer_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`delivery_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`empties_collected` integer DEFAULT 0 NOT NULL,
	`rate` integer NOT NULL,
	`amount` integer NOT NULL,
	`is_free` integer DEFAULT 0 NOT NULL,
	`free_reason` text,
	`employee_id` integer,
	`trip_id` integer,
	`cash_collected` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`status` text DEFAULT 'recorded' NOT NULL,
	`void_reason` text,
	`invoice_id` integer,
	`slot_key` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deliveries_quantity_check" CHECK("quantity" >= 0),
	CONSTRAINT "deliveries_empties_collected_check" CHECK("empties_collected" >= 0),
	CONSTRAINT "deliveries_is_free_check" CHECK("is_free" IN (0,1)),
	CONSTRAINT "deliveries_status_check" CHECK("status" IN ('recorded','void'))
);--> statement-breakpoint
INSERT INTO `__new_deliveries`(`id`, `uuid`, `customer_id`, `product_id`, `delivery_date`, `quantity`, `empties_collected`, `rate`, `amount`, `is_free`, `free_reason`, `employee_id`, `trip_id`, `cash_collected`, `notes`, `status`, `void_reason`, `invoice_id`, `slot_key`, `created_at`, `updated_at`, `created_by`, `updated_by`) SELECT `id`, `uuid`, `customer_id`, `product_id`, `delivery_date`, `quantity`, `empties_collected`, `rate`, `amount`, `is_free`, `free_reason`, `employee_id`, `trip_id`, `cash_collected`, `notes`, `status`, `void_reason`, `invoice_id`, coalesce(`slot_key`, ''), `created_at`, `updated_at`, `created_by`, `updated_by` FROM `deliveries`;--> statement-breakpoint
DROP TABLE `deliveries`;--> statement-breakpoint
ALTER TABLE `__new_deliveries` RENAME TO `deliveries`;--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_uuid_unique` ON `deliveries` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_slot` ON `deliveries` (`customer_id`,`delivery_date`,`product_id`,`slot_key`) WHERE "deliveries"."status" = 'recorded';--> statement-breakpoint
CREATE INDEX `idx_deliveries_date` ON `deliveries` (`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_cust_date` ON `deliveries` (`customer_id`,`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_invoice` ON `deliveries` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_employee` ON `deliveries` (`employee_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`receipt_no` text,
	`customer_id` integer NOT NULL,
	`payment_date` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference_no` text,
	`received_by_employee_id` integer,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`void_reason` text,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_amount_check" CHECK("amount" > 0),
	CONSTRAINT "payments_method_check" CHECK("method" IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','online','other')),
	CONSTRAINT "payments_status_check" CHECK("status" IN ('active','void'))
);--> statement-breakpoint
INSERT INTO `__new_payments`(`id`, `uuid`, `receipt_no`, `customer_id`, `payment_date`, `amount`, `method`, `reference_no`, `received_by_employee_id`, `notes`, `status`, `void_reason`, `created_at`, `created_by`) SELECT `id`, `uuid`, `receipt_no`, `customer_id`, `payment_date`, `amount`, `method`, `reference_no`, `received_by_employee_id`, `notes`, `status`, `void_reason`, `created_at`, `created_by` FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_uuid_unique` ON `payments` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_no_unique` ON `payments` (`receipt_no`);--> statement-breakpoint
CREATE INDEX `idx_payments_customer` ON `payments` (`customer_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_payments_date` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `__new_expenses` (
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
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_amount_check" CHECK("amount" > 0),
	CONSTRAINT "expenses_payment_method_check" CHECK("payment_method" IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','credit','other')),
	CONSTRAINT "expenses_source_check" CHECK("source" IN ('manual','payroll','purchase','recurring')),
	CONSTRAINT "expenses_status_check" CHECK("status" IN ('active','void'))
);--> statement-breakpoint
INSERT INTO `__new_expenses`(`id`, `uuid`, `expense_date`, `category_id`, `amount`, `payment_method`, `vendor_name`, `description`, `reference_no`, `attachment_path`, `employee_id`, `vehicle_id`, `source`, `source_ref_table`, `source_ref_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`) SELECT `id`, `uuid`, `expense_date`, `category_id`, `amount`, `payment_method`, `vendor_name`, `description`, `reference_no`, `attachment_path`, `employee_id`, `vehicle_id`, `source`, `source_ref_table`, `source_ref_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by` FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_uuid_unique` ON `expenses` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_expenses_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_expenses_category` ON `expenses` (`category_id`,`expense_date`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`period` text NOT NULL,
	`generated_on` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_net` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_runs_status_check" CHECK("status" IN ('draft','finalized','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_uuid_unique` ON `payroll_runs` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_period_unique` ON `payroll_runs` (`period`);--> statement-breakpoint
CREATE TABLE `payroll_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`payroll_run_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`salary_type` text NOT NULL,
	`base_amount` integer DEFAULT 0 NOT NULL,
	`working_days` integer DEFAULT 0 NOT NULL,
	`days_present` real DEFAULT 0 NOT NULL,
	`days_absent` real DEFAULT 0 NOT NULL,
	`absence_deduction` integer DEFAULT 0 NOT NULL,
	`bottles_delivered` integer DEFAULT 0 NOT NULL,
	`commission_amount` integer DEFAULT 0 NOT NULL,
	`overtime_hours` real DEFAULT 0 NOT NULL,
	`overtime_amount` integer DEFAULT 0 NOT NULL,
	`bonus_amount` integer DEFAULT 0 NOT NULL,
	`advances_deducted` integer DEFAULT 0 NOT NULL,
	`other_deductions` integer DEFAULT 0 NOT NULL,
	`deduction_notes` text,
	`net_payable` integer DEFAULT 0 NOT NULL,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`payment_date` text,
	`payment_method` text,
	`expense_id` integer,
	`notes` text,
	FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_items_uuid_unique` ON `payroll_items` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payroll_item_run_employee` ON `payroll_items` (`payroll_run_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `salary_advances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`employee_id` integer NOT NULL,
	`advance_date` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text,
	`settled_in_payroll_item_id` integer,
	`status` text DEFAULT 'outstanding' NOT NULL,
	`expense_id` integer,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settled_in_payroll_item_id`) REFERENCES `payroll_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "salary_advances_amount_check" CHECK("amount" > 0),
	CONSTRAINT "salary_advances_status_check" CHECK("status" IN ('outstanding','settled','waived','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_advances_uuid_unique` ON `salary_advances` (`uuid`);
