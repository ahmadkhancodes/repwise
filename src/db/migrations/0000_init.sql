CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`waist_cm` real,
	`hips_cm` real,
	`chest_cm` real,
	`arm_cm` real,
	`thigh_cm` real,
	`neck_cm` real,
	`body_fat_pct` real,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `body_metrics_date_idx` ON `body_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`rule_id` text NOT NULL,
	`date` text NOT NULL,
	`text` text,
	`action` text,
	`state` text
);
--> statement-breakpoint
CREATE INDEX `cards_date_idx` ON `cards` (`date`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`media_url` text,
	`primary_muscles` text,
	`secondary` text,
	`equipment` text,
	`pattern` text,
	`difficulty` integer,
	`steps` text,
	`tips` text,
	`source` text,
	`licence` text,
	`is_custom` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `food_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`slot` text,
	`kcal` integer DEFAULT 0 NOT NULL,
	`p` real,
	`c` real,
	`f` real
);
--> statement-breakpoint
CREATE INDEX `food_logs_date_idx` ON `food_logs` (`date`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`day_type` text,
	`kcal_target` integer,
	`macros` text
);
--> statement-breakpoint
CREATE INDEX `meal_plans_date_idx` ON `meal_plans` (`date`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`meal_plan_id` text NOT NULL,
	`slot` text NOT NULL,
	`recipe_id` text,
	`portion` real DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`swapped_from` text,
	`eaten_at` integer
);
--> statement-breakpoint
CREATE INDEX `meals_meal_plan_idx` ON `meals` (`meal_plan_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`local_uri` text,
	`cloud_key` text,
	`pose` text
);
--> statement-breakpoint
CREATE INDEX `photos_date_idx` ON `photos` (`date`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	`block_no` integer,
	`week_start` text,
	`payload` text,
	`version` integer,
	`generated_by` text
);
--> statement-breakpoint
CREATE INDEX `plans_type_week_idx` ON `plans` (`type`,`week_start`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`name` text,
	`goal` text,
	`sex` text,
	`birth_year` integer,
	`height_cm` real,
	`weight_kg` real,
	`target_kg` real,
	`experience` text,
	`days` integer,
	`session_min` integer,
	`equipment` text,
	`injuries` text,
	`diet_type` text,
	`allergies` text,
	`dislikes` text,
	`cuisines` text,
	`budget` text,
	`cook_min` integer,
	`meals_per_day` integer,
	`meal_times` text,
	`units` text,
	`theme` text,
	`activity_level` text,
	`timezone` text,
	`locale` text,
	`onboarded_at` integer
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`cuisine` text,
	`diet_tags` text,
	`allergens` text,
	`ingredients` text,
	`steps` text,
	`prep_min` integer,
	`cost_level` integer,
	`kcal` integer,
	`protein` real,
	`carb` real,
	`fat` real,
	`image_url` text,
	`is_custom` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`folder` text,
	`items` text
);
--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`superset_group` text,
	`target_sets` integer,
	`target_reps` text,
	`target_load` real,
	`rest_s` integer,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `session_exercises_session_idx` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`plan_id` text,
	`date` text,
	`title` text,
	`day_index` integer,
	`status` text,
	`started_at` integer,
	`ended_at` integer,
	`paused_ms` integer,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `sessions_date_idx` ON `sessions` (`date`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`session_exercise_id` text NOT NULL,
	`idx` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'working' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rpe` real,
	`duration_s` integer,
	`distance_m` real,
	`done_at` integer
);
--> statement-breakpoint
CREATE INDEX `sets_session_exercise_idx` ON `sets` (`session_exercise_id`);