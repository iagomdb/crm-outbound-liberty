CREATE TYPE "public"."activity_type" AS ENUM('ligacao', 'email', 'voicemail', 'whatsapp', 'nota');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('ativa', 'pausada', 'arquivada');--> statement-breakpoint
CREATE TYPE "public"."contact_role" AS ENUM('atendente', 'analista', 'decisor', 'desconhecido');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('agendada', 'realizada', 'no_show', 'remarcada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."mental_state" AS ENUM('desconhecido', 'ainda_negocia', 'ja_deu_como_perdido');--> statement-breakpoint
CREATE TYPE "public"."objection_type" AS ENUM('nenhuma', 'ja_temos', 'manda_email', 'quanto_custa', 'sem_caso', 'so_ano_que_vem', 'sem_tempo', 'outra');--> statement-breakpoint
CREATE TYPE "public"."objective_hit" AS ENUM('nenhum', 'reuniao', 'email_nominal');--> statement-breakpoint
CREATE TYPE "public"."target_stage" AS ENUM('novo', 'tentando', 'conversa', 'qualificado', 'reuniao_agendada', 'handoff', 'ganho', 'perdido', 'nao_agora');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"contact_id" uuid,
	"type" "activity_type" DEFAULT 'ligacao' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reached_human" boolean DEFAULT false NOT NULL,
	"duration_sec" integer,
	"outcome" text,
	"stalled_at" text,
	"objection" "objection_type" DEFAULT 'nenhuma' NOT NULL,
	"objection_is_reflexo" boolean,
	"hypothesis_landed" boolean,
	"objective_hit" "objective_hit" DEFAULT 'nenhum' NOT NULL,
	"golden_hour" boolean,
	"next_action_at" timestamp with time zone,
	"next_action_pretext" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"offer_terms" text,
	"icp" text,
	"script_ref" text DEFAULT 'docs/cold-call-recuperacao-credito-v2.md',
	"status" "campaign_status" DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"data_abertura" date,
	"porte" text,
	"cnae_principal" text,
	"cnae_secundarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"natureza_juridica" text,
	"capital_social" numeric(15, 2),
	"tipo_email" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telefones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cep" varchar(8),
	"uf" varchar(2),
	"municipio" text,
	"bairro" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"socios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'consultas.plus',
	"icp_fit" boolean,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"nome" text,
	"papel" "contact_role" DEFAULT 'desconhecido' NOT NULL,
	"cargo" text,
	"telefone_direto" text,
	"email" text,
	"email_generico" boolean DEFAULT false NOT NULL,
	"melhor_horario" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"activity_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "meeting_status" DEFAULT 'agendada' NOT NULL,
	"casos_para_trazer" text,
	"handoff_notes" text,
	"resultado" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"stage" "target_stage" DEFAULT 'novo' NOT NULL,
	"mental_state" "mental_state" DEFAULT 'desconhecido' NOT NULL,
	"primary_contact_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_contact_at" timestamp with time zone,
	"next_action_at" timestamp with time zone,
	"next_action_pretext" text,
	"qualified" boolean DEFAULT false NOT NULL,
	"won_email_nominal" boolean DEFAULT false NOT NULL,
	"valor_estimado" numeric(15, 2),
	"priority" integer DEFAULT 0 NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moves" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_reason" text,
	"lost_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_target_idx" ON "activities" USING btree ("target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_occurred_idx" ON "activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "meetings_target_idx" ON "meetings" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_campaign_company_uidx" ON "targets" USING btree ("campaign_id","company_id");--> statement-breakpoint
CREATE INDEX "targets_campaign_stage_idx" ON "targets" USING btree ("campaign_id","stage");--> statement-breakpoint
CREATE INDEX "targets_next_action_idx" ON "targets" USING btree ("next_action_at");