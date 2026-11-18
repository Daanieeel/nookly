CREATE TABLE "documents" (
	"owner_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"state" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_owner_id_entity_id_pk" PRIMARY KEY("owner_id","entity_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;