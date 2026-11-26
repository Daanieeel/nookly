ALTER TABLE "auth_account" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "auth_account" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_account" ADD COLUMN "email_chosen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "reauthed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "primary_provider" text;--> statement-breakpoint
-- Every sign in method starts with the account's address. A placeholder is no address, and
-- where two password accounts differ only in the case of theirs, the older one keeps it.
UPDATE "auth_account" AS a SET "email" = u."email", "email_verified" = u."email_verified"
FROM "auth_user" AS u
WHERE u."id" = a."user_id"
  AND lower(u."email") NOT LIKE '%@users.nookly.invalid'
  AND NOT (a."provider_id" = 'credential' AND EXISTS (
    SELECT 1 FROM "auth_user" AS o JOIN "auth_account" AS oa
      ON oa."user_id" = o."id" AND oa."provider_id" = 'credential'
    WHERE o."id" <> u."id" AND lower(o."email") = lower(u."email")
      AND (o."created_at", o."id") < (u."created_at", u."id")));--> statement-breakpoint
-- The primary sign in method is the one an account got first.
UPDATE "auth_user" AS u SET "primary_provider" = (
  SELECT a."provider_id" FROM "auth_account" AS a
  WHERE a."user_id" = u."id" ORDER BY a."created_at", a."id" LIMIT 1);--> statement-breakpoint
-- A session of an account with one sign in method came through that one.
UPDATE "auth_session" AS s SET "provider" = (
  SELECT min(a."provider_id") FROM "auth_account" AS a
  WHERE a."user_id" = s."user_id" HAVING count(*) = 1);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_login_email" ON "auth_account" USING btree (lower("email")) WHERE "auth_account"."provider_id" = 'credential';
