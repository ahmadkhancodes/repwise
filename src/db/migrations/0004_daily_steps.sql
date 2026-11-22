CREATE TABLE `daily_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `daily_steps_date_idx` ON `daily_steps` (`date`);--> statement-breakpoint
CREATE INDEX `daily_steps_dirty_idx` ON `daily_steps` (`dirty`) WHERE dirty = 1;