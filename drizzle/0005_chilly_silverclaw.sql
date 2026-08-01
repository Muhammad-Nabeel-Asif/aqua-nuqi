CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`invoice_no` text NOT NULL,
	`customer_id` integer NOT NULL,
	`period` text,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`deliveries_qty` integer DEFAULT 0 NOT NULL,
	`deliveries_total` integer DEFAULT 0 NOT NULL,
	`charges_total` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`invoice_total` integer DEFAULT 0 NOT NULL,
	`total_payable` integer DEFAULT 0 NOT NULL,
	`paid_total` integer DEFAULT 0 NOT NULL,
	`closing_balance` integer DEFAULT 0 NOT NULL,
	`bottles_with_customer_at_issue` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`void_reason` text,
	`pdf_path` text,
	`last_shared_at` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoices_status_check" CHECK("status" IN ('draft','issued','partially_paid','paid','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_uuid_unique` ON `invoices` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_no_unique` ON `invoices` (`invoice_no`);--> statement-breakpoint
CREATE INDEX `idx_invoices_customer` ON `invoices` (`customer_id`,`period`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
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
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_amount_check" CHECK("amount" > 0),
	CONSTRAINT "payments_method_check" CHECK("method" IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','online','other')),
	CONSTRAINT "payments_status_check" CHECK("status" IN ('active','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_uuid_unique` ON `payments` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_no_unique` ON `payments` (`receipt_no`);--> statement-breakpoint
CREATE INDEX `idx_payments_customer` ON `payments` (`customer_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_payments_date` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_allocations_amount_check" CHECK("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_alloc_payment` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_alloc_invoice` ON `payment_allocations` (`invoice_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deliveries_quantity_check" CHECK("quantity" >= 0),
	CONSTRAINT "deliveries_empties_collected_check" CHECK("empties_collected" >= 0),
	CONSTRAINT "deliveries_is_free_check" CHECK("is_free" IN (0,1)),
	CONSTRAINT "deliveries_status_check" CHECK("status" IN ('recorded','void'))
);--> statement-breakpoint
INSERT INTO `__new_deliveries`(`id`, `uuid`, `customer_id`, `product_id`, `delivery_date`, `quantity`, `empties_collected`, `rate`, `amount`, `is_free`, `free_reason`, `employee_id`, `trip_id`, `cash_collected`, `notes`, `status`, `void_reason`, `invoice_id`, `slot_key`, `created_at`, `updated_at`, `created_by`, `updated_by`) SELECT `id`, `uuid`, `customer_id`, `product_id`, `delivery_date`, `quantity`, `empties_collected`, `rate`, `amount`, `is_free`, `free_reason`, `employee_id`, `trip_id`, `cash_collected`, `notes`, `status`, `void_reason`, `invoice_id`, coalesce(`slot_key`, '') , `created_at`, `updated_at`, `created_by`, `updated_by` FROM `deliveries`;--> statement-breakpoint
DROP TABLE `deliveries`;--> statement-breakpoint
ALTER TABLE `__new_deliveries` RENAME TO `deliveries`;--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_uuid_unique` ON `deliveries` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_slot` ON `deliveries` (`customer_id`,`delivery_date`,`product_id`,`slot_key`) WHERE "deliveries"."status" = 'recorded';--> statement-breakpoint
CREATE INDEX `idx_deliveries_date` ON `deliveries` (`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_cust_date` ON `deliveries` (`customer_id`,`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_invoice` ON `deliveries` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_employee` ON `deliveries` (`employee_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `__new_customer_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`customer_id` integer NOT NULL,
	`adjustment_date` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`quantity` integer,
	`description` text,
	`invoice_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_adjustments_kind_check" CHECK("kind" IN (
        'damaged_bottle','lost_bottle','dispenser_rent','delivery_charge','other_charge',
        'discount','write_off','deposit_received','deposit_refunded'
      )),
	CONSTRAINT "customer_adjustments_status_check" CHECK("status" IN ('active','void'))
);--> statement-breakpoint
INSERT INTO `__new_customer_adjustments`(`id`, `uuid`, `customer_id`, `adjustment_date`, `kind`, `amount`, `quantity`, `description`, `invoice_id`, `status`, `created_at`, `created_by`) SELECT `id`, `uuid`, `customer_id`, `adjustment_date`, `kind`, `amount`, `quantity`, `description`, `invoice_id`, `status`, `created_at`, `created_by` FROM `customer_adjustments`;--> statement-breakpoint
DROP TABLE `customer_adjustments`;--> statement-breakpoint
ALTER TABLE `__new_customer_adjustments` RENAME TO `customer_adjustments`;--> statement-breakpoint
CREATE UNIQUE INDEX `customer_adjustments_uuid_unique` ON `customer_adjustments` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_adjustments_customer` ON `customer_adjustments` (`customer_id`,`adjustment_date`);--> statement-breakpoint
CREATE INDEX `idx_adjustments_invoice` ON `customer_adjustments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`line_no` integer NOT NULL,
	`line_type` text NOT NULL,
	`line_date` text,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`rate` integer DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`delivery_id` integer,
	`adjustment_id` integer,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjustment_id`) REFERENCES `customer_adjustments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_lines_line_type_check" CHECK("line_type" IN ('delivery','package','rental','charge','discount','deposit','tax','carry_forward'))
);--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_invoice` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
