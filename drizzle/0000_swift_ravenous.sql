CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_table` text,
	`entity_id` integer,
	`summary` text NOT NULL,
	`before_json` text,
	`after_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_log_action_check" CHECK("audit_log"."action" IN ('create','update','delete','void','login','logout','settings_change','backup','restore','period_close','period_reopen','export','app_upgrade'))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_occurred` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_table`,`entity_id`);--> statement-breakpoint
CREATE TABLE `backup_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`file_path` text NOT NULL,
	`size_bytes` integer,
	`checksum` text,
	`status` text NOT NULL,
	`message` text,
	CONSTRAINT "backup_log_kind_check" CHECK("backup_log"."kind" IN ('manual','on_exit','daily','weekly','pre_migration','pre_restore')),
	CONSTRAINT "backup_log_status_check" CHECK("backup_log"."status" IN ('success','failed'))
);
--> statement-breakpoint
CREATE TABLE `closed_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period` text NOT NULL,
	`closed_at` text NOT NULL,
	`closed_by` integer,
	`reopened_at` text,
	`reopened_by` integer,
	`notes` text,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reopened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `closed_periods_period_unique` ON `closed_periods` (`period`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`name` text PRIMARY KEY NOT NULL,
	`next_value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`pin_hash` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('owner','operator','viewer')),
	CONSTRAINT "users_is_active_check" CHECK("users"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_uuid_unique` ON `users` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`size_liters` real,
	`kind` text NOT NULL,
	`is_returnable` integer DEFAULT 1 NOT NULL,
	`default_rate` integer DEFAULT 0 NOT NULL,
	`default_deposit` integer DEFAULT 0 NOT NULL,
	`track_stock` integer DEFAULT 1 NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "products_kind_check" CHECK("products"."kind" IN ('returnable_bottle','packaged_water','equipment','rental','service')),
	CONSTRAINT "products_is_returnable_check" CHECK("products"."is_returnable" IN (0,1)),
	CONSTRAINT "products_track_stock_check" CHECK("products"."track_stock" IN (0,1)),
	CONSTRAINT "products_is_default_check" CHECK("products"."is_default" IN (0,1)),
	CONSTRAINT "products_is_active_check" CHECK("products"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_uuid_unique` ON `products` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`is_system` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "expense_categories_is_system_check" CHECK("expense_categories"."is_system" IN (0,1)),
	CONSTRAINT "expense_categories_is_active_check" CHECK("expense_categories"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_uuid_unique` ON `expense_categories` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_unique` ON `expense_categories` (`name`);