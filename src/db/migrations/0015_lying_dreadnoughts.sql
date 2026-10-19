CREATE TYPE "public"."user_role" AS ENUM('admin', 'operador');--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'operador' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_members_uidx" ON "campaign_members" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "campaign_members_user_idx" ON "campaign_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_idx" ON "activities" USING btree ("user_id","occurred_at");--> statement-breakpoint
-- dados (manual): quem já existia antes dos papéis vira admin — senão o dono do
-- CRM acordaria operador sem carteira nenhuma, trancado fora do /usuarios.
-- O default 'operador' vale só pra quem for criado daqui pra frente.
UPDATE "users" SET "role" = 'admin';--> statement-breakpoint
-- ligações de antes do multiusuário: o CRM tinha um operador só (o primeiro usuário)
UPDATE "activities" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1) WHERE "user_id" IS NULL;
