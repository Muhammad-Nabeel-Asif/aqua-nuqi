CREATE TABLE `areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "areas_is_active_check" CHECK("areas"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `areas_uuid_unique` ON `areas` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `areas_name_unique` ON `areas` (`name`);--> statement-breakpoint
CREATE TABLE `routes` (
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
	CONSTRAINT "routes_is_active_check" CHECK("routes"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routes_uuid_unique` ON `routes` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `routes_name_unique` ON `routes` (`name`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`customer_type` text DEFAULT 'residential' NOT NULL,
	`phone_primary` text,
	`phone_secondary` text,
	`whatsapp_number` text,
	`email` text,
	`address_line` text,
	`landmark` text,
	`area_id` integer,
	`route_id` integer,
	`delivery_notes` text,
	`billing_mode` text DEFAULT 'per_bottle' NOT NULL,
	`package_amount` integer,
	`package_included_qty` integer,
	`package_excess_rate` integer,
	`billing_day` integer,
	`credit_limit` integer,
	`security_deposit_held` integer DEFAULT 0 NOT NULL,
	`opening_bottles` integer DEFAULT 0 NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_as_of` text,
	`status` text DEFAULT 'active' NOT NULL,
	`paused_from` text,
	`paused_to` text,
	`status_reason` text,
	`joined_on` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customers_customer_type_check" CHECK("customers"."customer_type" IN ('residential','commercial','walk_in')),
	CONSTRAINT "customers_billing_mode_check" CHECK("customers"."billing_mode" IN ('per_bottle','monthly_package')),
	CONSTRAINT "customers_status_check" CHECK("customers"."status" IN ('active','paused','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_uuid_unique` ON `customers` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_customers_name` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_customers_route` ON `customers` (`route_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_area` ON `customers` (`area_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_status` ON `customers` (`status`);--> statement-breakpoint
CREATE TABLE `customer_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`customer_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`rate` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`reason` text,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_rates_uuid_unique` ON `customer_rates` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_customer_rates_lookup` ON `customer_rates` (`customer_id`,`product_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `customer_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`mode` text NOT NULL,
	`weekdays` text,
	`interval_days` integer,
	`default_qty` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_schedules_mode_check" CHECK("customer_schedules"."mode" IN ('weekdays','interval_days','on_call'))
);
--> statement-breakpoint
CREATE TABLE `customer_balances` (
	`customer_id` integer PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`bottles_with_customer` integer DEFAULT 0 NOT NULL,
	`last_delivery_date` text,
	`last_payment_date` text,
	`last_invoice_id` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`customer_id` integer NOT NULL,
	`entry_date` text NOT NULL,
	`entry_type` text NOT NULL,
	`debit` integer DEFAULT 0 NOT NULL,
	`credit` integer DEFAULT 0 NOT NULL,
	`balance_after` integer NOT NULL,
	`description` text NOT NULL,
	`ref_table` text,
	`ref_id` integer,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_entries_entry_type_check" CHECK("ledger_entries"."entry_type" IN ('opening_balance','invoice','payment','adjustment_debit','adjustment_credit','deposit_received','deposit_refunded','write_off','void_reversal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_uuid_unique` ON `ledger_entries` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_ledger_customer` ON `ledger_entries` (`customer_id`,`entry_date`,`id`);
