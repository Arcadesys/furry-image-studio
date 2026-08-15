CREATE TABLE `trace_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`asset_role` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trace_annotations_trace_id_idx` ON `trace_annotations` (`trace_id`);--> statement-breakpoint
CREATE TABLE `trace_reviews` (
	`trace_id` text PRIMARY KEY NOT NULL,
	`scores_json` text DEFAULT '{}' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
