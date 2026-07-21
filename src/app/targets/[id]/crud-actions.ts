"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { activities, campaigns, companies, contacts, meetings, targets } from "@/db/schema";
import type { Stage } from "@/core/pipeline";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const digits = (v: FormDataEntryValue | null) => s(v).replace(/\D/g, "");
const on = (v: FormDataEntryValue | null) => v === "on" || v === "true";

// -------------------------------------------------- contatos
export async function createContact(companyId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  await db.insert(contacts).values({
    companyId,
    nome: s(fd.get("nome")) || null,
    papel: (s(fd.get("papel")) || "desconhecido") as typeof contacts.$inferInsert.papel,
    cargo: s(fd.get("cargo")) || null,
    telefoneDireto: digits(fd.get("telefoneDireto")) || null,
    email: s(fd.get("email")) || null,
    emailGenerico: on(fd.get("emailGenerico")),
    melhorHorario: s(fd.get("melhorHorario")) || null,
  });
  revalidatePath("/", "layout");
}

export async function updateContact(contactId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  await db
    .update(contacts)
    .set({
      nome: s(fd.get("nome")) || null,
      papel: (s(fd.get("papel")) || "desconhecido") as typeof contacts.$inferInsert.papel,
      cargo: s(fd.get("cargo")) || null,
      telefoneDireto: digits(fd.get("telefoneDireto")) || null,
      email: s(fd.get("email")) || null,
      emailGenerico: on(fd.get("emailGenerico")),
      melhorHorario: s(fd.get("melhorHorario")) || null,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));
  revalidatePath("/", "layout");
}

export async function deleteContact(contactId: string) {
  await requireUser();
  const db = getDb();
  await db.delete(contacts).where(eq(contacts.id, contactId));
  revalidatePath("/", "layout");
}

// -------------------------------------------------- alvo
export async function updateTarget(targetId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  const stage = s(fd.get("stage"));
  const mental = s(fd.get("mentalState"));
  const nextRaw = s(fd.get("nextActionAt"));
  const valor = s(fd.get("valorEstimado"));
  await db
    .update(targets)
    .set({
      nextActionAt: nextRaw ? new Date(nextRaw) : null,
      nextActionPretext: s(fd.get("nextActionPretext")) || null,
      valorEstimado: valor || null,
      notes: s(fd.get("notes")) || null,
      updatedAt: new Date(),
      ...(stage ? { stage: stage as Stage, stageChangedAt: new Date() } : {}),
      ...(mental ? { mentalState: mental as typeof targets.$inferInsert.mentalState } : {}),
    })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

export async function archiveTargetDetail(targetId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  await db
    .update(targets)
    .set({ archivedAt: new Date(), archiveReason: s(fd.get("reason")) || "arquivado manualmente", updatedAt: new Date() })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

export async function unarchiveTarget(targetId: string) {
  await requireUser();
  const db = getDb();
  await db
    .update(targets)
    .set({ archivedAt: null, archiveReason: null, stageChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

/** Apaga o alvo da carteira — leva junto ligações/reuniões dele. A empresa fica cadastrada. */
export async function deleteTarget(targetId: string) {
  await requireUser();
  const db = getDb();
  const [t] = await db
    .select({ slug: campaigns.slug })
    .from(targets)
    .innerJoin(campaigns, eq(targets.campaignId, campaigns.id))
    .where(eq(targets.id, targetId));
  await db.delete(targets).where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
  redirect(t?.slug ? `/campaigns/${t.slug}` : "/");
}

// -------------------------------------------------- atividades (ligações)
/** Corrige os textos de uma ligação já registrada (resultado, travou em, notas). */
export async function updateActivity(activityId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  await db
    .update(activities)
    .set({
      outcome: s(fd.get("outcome")) || null,
      stalledAt: s(fd.get("stalledAt")) || null,
      notes: s(fd.get("notes")) || null,
    })
    .where(eq(activities.id, activityId));
  revalidatePath("/", "layout");
}

/**
 * Apaga uma ligação registrada errado: devolve a tentativa ao alvo e remove a
 * reunião que ela tiver gerado. Estágio/estado mental não são recalculados —
 * se a ligação errada moveu o funil, ajuste no card "Alvo".
 */
export async function deleteActivity(activityId: string) {
  await requireUser();
  const db = getDb();
  const [act] = await db
    .select({ targetId: activities.targetId })
    .from(activities)
    .where(eq(activities.id, activityId));
  if (!act) return;
  await db.delete(meetings).where(eq(meetings.activityId, activityId));
  await db.delete(activities).where(eq(activities.id, activityId));
  await db
    .update(targets)
    .set({ attempts: sql`greatest(${targets.attempts} - 1, 0)`, updatedAt: new Date() })
    .where(eq(targets.id, act.targetId));
  revalidatePath("/", "layout");
}

// -------------------------------------------------- empresa
export async function updateCompany(companyId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  const razao = s(fd.get("razaoSocial"));
  await db
    .update(companies)
    .set({
      ...(razao ? { razaoSocial: razao } : {}),
      nomeFantasia: s(fd.get("nomeFantasia")) || null,
      telefones: [digits(fd.get("tel1")), digits(fd.get("tel2"))].filter(Boolean),
      emails: [s(fd.get("email1")), s(fd.get("email2"))].filter(Boolean),
      cnaePrincipal: s(fd.get("cnaePrincipal")) || null,
      porte: s(fd.get("porte")) || null,
      uf: s(fd.get("uf")).slice(0, 2).toUpperCase() || null,
      municipio: s(fd.get("municipio")) || null,
      notes: s(fd.get("notes")) || null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
  revalidatePath("/", "layout");
}

/** Apaga a empresa do CRM inteiro — contatos e alvos dela em TODAS as carteiras vão junto. */
export async function deleteCompany(companyId: string) {
  await requireUser();
  const db = getDb();
  await db.delete(companies).where(eq(companies.id, companyId));
  revalidatePath("/", "layout");
  redirect("/");
}
