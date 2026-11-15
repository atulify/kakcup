CREATE TABLE "boots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"kak_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"kak_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chug_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"chug_1" numeric(10, 3),
	"chug_2" numeric(10, 3),
	"average" numeric(10, 3),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "fish_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"weight" numeric(10, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "golf_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"score" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "kaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "kaks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"kak1" text,
	"kak2" text,
	"kak3" text,
	"kak4" text,
	"kak_1" uuid,
	"kak_2" uuid,
	"kak_3" uuid,
	"kak_4" uuid,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tie_break_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"event" text NOT NULL,
	"delta_points" numeric(6, 2) NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"email" text,
	"password_hash" text,
	"first_name" text,
	"last_name" text,
	"profile_image_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"fishing_locked" boolean DEFAULT false NOT NULL,
	"chug_locked" boolean DEFAULT false NOT NULL,
	"golf_locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "years_year_unique" UNIQUE("year")
);
--> statement-breakpoint
ALTER TABLE "boots" ADD CONSTRAINT "boots_year_id_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boots" ADD CONSTRAINT "boots_kak_id_kaks_id_fk" FOREIGN KEY ("kak_id") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champs" ADD CONSTRAINT "champs_year_id_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champs" ADD CONSTRAINT "champs_kak_id_kaks_id_fk" FOREIGN KEY ("kak_id") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_kak_1_kaks_id_fk" FOREIGN KEY ("kak_1") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_kak_2_kaks_id_fk" FOREIGN KEY ("kak_2") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_kak_3_kaks_id_fk" FOREIGN KEY ("kak_3") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_kak_4_kaks_id_fk" FOREIGN KEY ("kak_4") REFERENCES "public"."kaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_break_adjustments" ADD CONSTRAINT "tie_break_adjustments_year_id_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_break_adjustments" ADD CONSTRAINT "tie_break_adjustments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_break_adjustments" ADD CONSTRAINT "tie_break_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_boots_year_kak" ON "boots" USING btree ("year_id","kak_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_champs_year_kak" ON "champs" USING btree ("year_id","kak_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_chug_year_team" ON "chug_times" USING btree ("year_id","team_id");--> statement-breakpoint
CREATE INDEX "fish_weights_year_team_idx" ON "fish_weights" USING btree ("year_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_golf_year_team" ON "golf_scores" USING btree ("year_id","team_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "teams_year_id_idx" ON "teams" USING btree ("year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_tie_break_year" ON "tie_break_adjustments" USING btree ("year_id");