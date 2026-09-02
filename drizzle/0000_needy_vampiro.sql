CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`image_url` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`condition` text NOT NULL,
	`price` real NOT NULL,
	`ai_draft` text,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "listings_title_length" CHECK(length("listings"."title") <= 70),
	CONSTRAINT "listings_description_length" CHECK(length("listings"."description") <= 1000),
	CONSTRAINT "listings_positive_price" CHECK("listings"."price" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_listings_created_at` ON `listings` (`created_at`);