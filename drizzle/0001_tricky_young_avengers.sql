CREATE TABLE "expense_insights" (
	"user_id" text PRIMARY KEY NOT NULL,
	"week_text" text,
	"month_text" text,
	"two_month_text" text,
	"data_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_insights" ADD CONSTRAINT "expense_insights_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_share_links" ADD CONSTRAINT "photo_share_links_photo_id_expense_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."expense_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_share_links_photo_id_unq" ON "photo_share_links" USING btree ("photo_id");