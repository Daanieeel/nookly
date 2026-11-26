CREATE TABLE "auth_ended_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"device_name" text,
	"platform" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_out" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "seen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_ended_session_user" ON "auth_ended_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_ended_session_session" ON "auth_ended_session" USING btree ("session_id");--> statement-breakpoint
-- Sessions that exist already are devices in use.
UPDATE "auth_session" SET "seen" = true;--> statement-breakpoint
-- Remembers every device whose session ends, whatever ends it: a password reset, expiry, a
-- disconnected sign in method or a deleted account.
CREATE FUNCTION "remember_ended_session"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "auth_ended_session" ("token_hash", "session_id", "user_id", "device_name", "platform", "created_at", "last_used_at")
  VALUES (encode(sha256(convert_to(OLD."token", 'UTF8')), 'hex'), OLD."id", OLD."user_id", OLD."device_name", OLD."platform", OLD."created_at", OLD."updated_at")
  ON CONFLICT ("token_hash") DO NOTHING;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER "auth_session_ended" AFTER DELETE ON "auth_session"
FOR EACH ROW WHEN (OLD."seen" AND NOT OLD."pending")
EXECUTE FUNCTION "remember_ended_session"();
