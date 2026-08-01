CREATE TABLE `vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`registration_no` text,
	`vehicle_type` text,
	`capacity_bottles` integer,
	`is_active` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "vehicles_is_active_check" CHECK("is_active" IN (0,1)),
	CONSTRAINT "vehicles_vehicle_type_check" CHECK("vehicle_type" IS NULL OR "vehicle_type" IN ('loader','rickshaw','bike','van','truck','other'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_uuid_unique` ON `vehicles` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_registration_no_unique` ON `vehicles` (`registration_no`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`trip_date` text NOT NULL,
	`employee_id` integer,
	`vehicle_id` integer,
	`route_id` integer,
	`filled_loaded` integer DEFAULT 0 NOT NULL,
	`filled_returned` integer DEFAULT 0 NOT NULL,
	`empties_returned` integer DEFAULT 0 NOT NULL,
	`bottles_delivered_calc` integer DEFAULT 0 NOT NULL,
	`cash_expected` integer DEFAULT 0 NOT NULL,
	`cash_submitted` integer DEFAULT 0 NOT NULL,
	`cash_variance` integer DEFAULT 0 NOT NULL,
	`bottle_variance` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trips_status_check" CHECK("status" IN ('open','closed','void'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `trips_uuid_unique` ON `trips` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_trips_date` ON `trips` (`trip_date`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`movement_date` text NOT NULL,
	`product_id` integer NOT NULL,
	`bottle_state` text NOT NULL,
	`quantity` integer NOT NULL,
	`from_location` text NOT NULL,
	`to_location` text NOT NULL,
	`vehicle_id` integer,
	`customer_id` integer,
	`reason` text NOT NULL,
	`ref_table` text,
	`ref_id` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_quantity_check" CHECK("quantity" > 0),
	CONSTRAINT "stock_movements_bottle_state_check" CHECK("bottle_state" IN ('filled','empty')),
	CONSTRAINT "stock_movements_from_location_check" CHECK("from_location" IN ('none','plant','van','customer','supplier')),
	CONSTRAINT "stock_movements_to_location_check" CHECK("to_location" IN ('none','plant','van','customer','scrap')),
	CONSTRAINT "stock_movements_reason_check" CHECK("reason" IN ('purchase','production','load_to_van','unload_from_van','delivery','empty_pickup','damaged','lost','scrapped','adjustment','opening_stock'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_uuid_unique` ON `stock_movements` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_stock_date` ON `stock_movements` (`movement_date`);--> statement-breakpoint
CREATE INDEX `idx_stock_product` ON `stock_movements` (`product_id`,`bottle_state`);--> statement-breakpoint
CREATE INDEX `idx_stock_ref` ON `stock_movements` (`ref_table`,`ref_id`);--> statement-breakpoint
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
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
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
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
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
PRAGMA foreign_keys=ON;
