CREATE TABLE "script_group_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"entrada" boolean DEFAULT false NOT NULL,
	"padrao_id" uuid,
	"pos_x" integer DEFAULT 0 NOT NULL,
	"pos_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "script_nodes_entrada_idx";--> statement-breakpoint
ALTER TABLE "script_nodes" ADD COLUMN "proximo_id" uuid;--> statement-breakpoint
ALTER TABLE "script_group_options" ADD CONSTRAINT "script_group_options_group_id_script_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."script_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_group_options" ADD CONSTRAINT "script_group_options_node_id_script_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."script_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_groups" ADD CONSTRAINT "script_groups_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_groups" ADD CONSTRAINT "script_groups_padrao_id_script_groups_id_fk" FOREIGN KEY ("padrao_id") REFERENCES "public"."script_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "script_group_options_uidx" ON "script_group_options" USING btree ("group_id","node_id");--> statement-breakpoint
CREATE INDEX "script_group_options_group_idx" ON "script_group_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "script_group_options_node_idx" ON "script_group_options" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "script_groups_campaign_idx" ON "script_groups" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "script_groups_entrada_idx" ON "script_groups" USING btree ("campaign_id","entrada");--> statement-breakpoint
ALTER TABLE "script_nodes" ADD CONSTRAINT "script_nodes_proximo_id_script_groups_id_fk" FOREIGN KEY ("proximo_id") REFERENCES "public"."script_groups"("id") ON DELETE set null ON UPDATE no action;