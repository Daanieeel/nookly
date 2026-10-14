CREATE TABLE "blobs" (
	"owner_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blobs_owner_id_sha256_pk" PRIMARY KEY("owner_id","sha256")
);
--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;