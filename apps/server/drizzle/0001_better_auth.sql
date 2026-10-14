CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_name" text,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"owner_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_owner_id_device_id_pk" PRIMARY KEY("owner_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
-- Every account from before better-auth keeps its id, its email and its password
-- (argon2id, which better-auth checks through Bun.password). Its username is the
-- email's local part, numbered when two would be the same.
WITH base AS (
	SELECT id, email, email_verified_at, created_at,
		left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]', '', 'g'), 24) AS raw
	FROM "users"
), stems AS (
	SELECT *, CASE WHEN length(raw) < 3 THEN raw || 'user' ELSE raw END AS stem FROM base
), numbered AS (
	SELECT *, row_number() OVER (PARTITION BY stem ORDER BY created_at, id) AS n FROM stems
)
INSERT INTO "auth_user" ("id", "name", "email", "email_verified", "username", "display_username", "created_at", "updated_at")
SELECT id, stem, email, email_verified_at IS NOT NULL,
	CASE WHEN n = 1 THEN stem ELSE stem || n END,
	CASE WHEN n = 1 THEN stem ELSE stem || n END,
	created_at, now()
FROM numbered;--> statement-breakpoint
INSERT INTO "auth_account" ("id", "user_id", "provider_id", "account_id", "password", "created_at", "updated_at")
SELECT gen_random_uuid(), id, 'credential', id::text, password_hash, created_at, now()
FROM "users" WHERE password_hash IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_auth_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;