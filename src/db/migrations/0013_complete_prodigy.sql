CREATE TYPE "public"."script_node_kind" AS ENUM('fala', 'reacao', 'saida');--> statement-breakpoint
CREATE TABLE "script_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" "script_node_kind" DEFAULT 'fala' NOT NULL,
	"titulo" text NOT NULL,
	"fala" text,
	"nota" text,
	"entrada" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "caminho" jsonb;--> statement-breakpoint
ALTER TABLE "script_edges" ADD CONSTRAINT "script_edges_from_id_script_nodes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."script_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_edges" ADD CONSTRAINT "script_edges_to_id_script_nodes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."script_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_nodes" ADD CONSTRAINT "script_nodes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "script_edges_from_to_uidx" ON "script_edges" USING btree ("from_id","to_id");--> statement-breakpoint
CREATE INDEX "script_edges_from_idx" ON "script_edges" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "script_edges_to_idx" ON "script_edges" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "script_nodes_campaign_idx" ON "script_nodes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "script_nodes_entrada_idx" ON "script_nodes" USING btree ("campaign_id","entrada");