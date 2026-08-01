CREATE TABLE `customer_adjustments` (
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
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_adjustments_kind_check" CHECK("customer_adjustments"."kind" IN (
        'damaged_bottle','lost_bottle','dispenser_rent','delivery_charge','other_charge',
        'discount','write_off','deposit_received','deposit_refunded'
      )),
	CONSTRAINT "customer_adjustments_status_check" CHECK("customer_adjustments"."status" IN ('active','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_adjustments_uuid_unique` ON `customer_adjustments` (`uuid`);--> statement-breakpoint
CREATE TABLE `deliveries` (
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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deliveries_quantity_check" CHECK("deliveries"."quantity" >= 0),
	CONSTRAINT "deliveries_empties_collected_check" CHECK("deliveries"."empties_collected" >= 0),
	CONSTRAINT "deliveries_is_free_check" CHECK("deliveries"."is_free" IN (0,1)),
	CONSTRAINT "deliveries_status_check" CHECK("deliveries"."status" IN ('recorded','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_uuid_unique` ON `deliveries` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_slot` ON `deliveries` (`customer_id`,`delivery_date`,`product_id`) WHERE "deliveries"."status" = 'recorded';--> statement-breakpoint
CREATE INDEX `idx_deliveries_date` ON `deliveries` (`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_cust_date` ON `deliveries` (`customer_id`,`delivery_date`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_invoice` ON `deliveries` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_employee` ON `deliveries` (`employee_id`,`delivery_date`);