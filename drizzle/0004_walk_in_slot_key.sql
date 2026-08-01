ALTER TABLE `deliveries` ADD `slot_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP INDEX `uq_delivery_slot`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_slot` ON `deliveries` (`customer_id`,`delivery_date`,`product_id`,`slot_key`) WHERE "deliveries"."status" = 'recorded';
