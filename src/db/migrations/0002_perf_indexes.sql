DROP INDEX `meal_plans_date_idx`;--> statement-breakpoint
CREATE INDEX `meal_plans_date_updated_idx` ON `meal_plans` (`date`,`updated_at`);--> statement-breakpoint
CREATE INDEX `meal_plans_dirty_idx` ON `meal_plans` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
DROP INDEX `meals_meal_plan_idx`;--> statement-breakpoint
CREATE INDEX `meals_plan_created_idx` ON `meals` (`meal_plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `meals_dirty_idx` ON `meals` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
DROP INDEX `session_exercises_session_idx`;--> statement-breakpoint
CREATE INDEX `session_exercises_session_pos_idx` ON `session_exercises` (`session_id`,`position`);--> statement-breakpoint
CREATE INDEX `session_exercises_exercise_idx` ON `session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_dirty_idx` ON `session_exercises` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
DROP INDEX `sets_session_exercise_idx`;--> statement-breakpoint
CREATE INDEX `sets_session_exercise_idx_idx` ON `sets` (`session_exercise_id`,`idx`);--> statement-breakpoint
CREATE INDEX `sets_dirty_idx` ON `sets` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `body_metrics_dirty_idx` ON `body_metrics` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `cards_dirty_idx` ON `cards` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `exercises_dirty_idx` ON `exercises` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `food_logs_meal_idx` ON `food_logs` (`meal_id`);--> statement-breakpoint
CREATE INDEX `food_logs_dirty_idx` ON `food_logs` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `photos_dirty_idx` ON `photos` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `plans_dirty_idx` ON `plans` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `recipes_dirty_idx` ON `recipes` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `routines_dirty_idx` ON `routines` (`dirty`) WHERE dirty = 1;--> statement-breakpoint
CREATE INDEX `sessions_status_ended_idx` ON `sessions` (`status`,`ended_at`);--> statement-breakpoint
CREATE INDEX `sessions_status_started_idx` ON `sessions` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_date_idx` ON `sessions` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `sessions_dirty_idx` ON `sessions` (`dirty`) WHERE dirty = 1;