-- Phase 8 review: typed payment purpose so deposit receipts are liabilities, not cash revenue.
ALTER TABLE `payments` ADD COLUMN `purpose` TEXT NOT NULL DEFAULT 'payment';--> statement-breakpoint
UPDATE `payments` SET `purpose` = 'deposit' WHERE `notes` LIKE '[deposit]%';
