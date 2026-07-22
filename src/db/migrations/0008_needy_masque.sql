CREATE TYPE "public"."cobranca_type" AS ENUM('nao_possui', 'cobranca_interna', 'juridico_interno', 'escritorio_terceirizado', 'nao_soube');--> statement-breakpoint
CREATE TYPE "public"."faixa_clientes" AS ENUM('ate_50', 'de_51_200', 'de_201_500', 'mais_500');--> statement-breakpoint
CREATE TYPE "public"."icp_grade" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."porte_percebido" AS ENUM('micro', 'pequena', 'media', 'grande');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "dor_percebida" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tipo_cobranca" "cobranca_type";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "faixa_clientes" "faixa_clientes";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "porte_percebido" "porte_percebido";--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "icp_grade" "icp_grade";