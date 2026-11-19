ALTER TABLE `food_logs` ADD `meal_id` text;--> statement-breakpoint
-- Backfill: before this column a 'plan' log was matched to its meal by (date, slot). Give each
-- existing one the eaten meal of that slot on that date (local only; not re-synced).
UPDATE `food_logs` SET `meal_id` = (
	SELECT `m`.`id` FROM `meals` `m`
	JOIN `meal_plans` `mp` ON `mp`.`id` = `m`.`meal_plan_id`
	WHERE `mp`.`date` = `food_logs`.`date`
		AND `m`.`slot` = `food_logs`.`slot`
		AND `m`.`status` = 'eaten'
		AND `m`.`deleted_at` IS NULL
		AND `mp`.`deleted_at` IS NULL
		AND `m`.`id` NOT IN (SELECT `meal_id` FROM `food_logs` WHERE `meal_id` IS NOT NULL)
	ORDER BY `m`.`eaten_at` DESC, `m`.`created_at` DESC
	LIMIT 1
)
WHERE `source` = 'plan' AND `meal_id` IS NULL AND `deleted_at` IS NULL;
