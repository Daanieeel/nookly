ALTER TABLE "auth_user" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "terms_accepted_at" timestamp with time zone;