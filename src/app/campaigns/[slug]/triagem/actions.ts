"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { companies, targets } from "@/db/schema";
import { getCampaignBySlug, getTriagemQueue } from "@/db/queries";

/**
 * Decisão de triagem de ICP (roadmap Fase 1). Fica gravada na EMPRESA (global,
 * por CNPJ) — não retriar a mesma empresa em outra campanha. "Fit" move o alvo
 * pra pré-fila do kanban (novo → fit); "fora do ICP" arquiva o alvo: discar
 * fora do ICP é tempo perdido.
 */
export async function triageCompany(companyId: string, targetId: string, fit: boolean) {
  await requireUser();
  const db = getDb();
  const now = new Date();
  await db.update(companies).set({ icpFit: fit, updatedAt: now }).where(eq(companies.id, companyId));
  if (fit) {
    await db
      .update(targets)
      .set({ stage: "fit", stageChangedAt: now, updatedAt: now })
      .where(and(eq(targets.id, targetId), eq(targets.stage, "novo")));
  } else {
    await db
      .update(targets)
      .set({ archivedAt: now, archiveReason: "fora do ICP", updatedAt: now })
      .where(eq(targets.id, targetId));
  }
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- ações em massa (checkboxes da triagem)

/** Checkboxes name="sel" value="targetId:companyId" → pares validados. */
const parseSel = (fd: FormData) =>
  fd
    .getAll("sel")
    .filter((v): v is string => typeof v === "string")
    .map((v) => {
      const [targetId, companyId] = v.split(":");
      return { targetId, companyId };
    })
    .filter((s) => s.targetId && s.companyId);

/** Tria os selecionados de uma vez (fit ⇒ pré-fila; fora do ICP ⇒ arquiva). */
export async function bulkTriage(slug: string, fit: boolean, fd: FormData) {
  await requireUser();
  const sel = parseSel(fd);
  if (sel.length) {
    const db = getDb();
    const now = new Date();
    await db
      .update(companies)
      .set({ icpFit: fit, updatedAt: now })
      .where(inArray(companies.id, sel.map((s) => s.companyId)));
    if (fit) {
      await db
        .update(targets)
        .set({ stage: "fit", stageChangedAt: now, updatedAt: now })
        .where(and(inArray(targets.id, sel.map((s) => s.targetId)), eq(targets.stage, "novo")));
    } else {
      await db
        .update(targets)
        .set({ archivedAt: now, archiveReason: "fora do ICP", updatedAt: now })
        .where(inArray(targets.id, sel.map((s) => s.targetId)));
    }
    revalidatePath("/", "layout");
  }
  redirect(`/campaigns/${slug}/triagem`);
}

/** Apaga da carteira os selecionados — pra descartar importações erradas. As empresas (globais) ficam. */
export async function bulkDelete(slug: string, fd: FormData) {
  await requireUser();
  const sel = parseSel(fd);
  if (sel.length) {
    const db = getDb();
    await db.delete(targets).where(inArray(targets.id, sel.map((s) => s.targetId)));
    revalidatePath("/", "layout");
  }
  redirect(`/campaigns/${slug}/triagem`);
}

/** Apaga TODOS os pendentes de triagem da carteira (todas as páginas) — desfaz um import inteiro errado. */
export async function bulkDeleteAllPending(slug: string) {
  await requireUser();
  const campaign = await getCampaignBySlug(slug);
  if (campaign) {
    const pending = await getTriagemQueue(campaign.id);
    if (pending.length) {
      const db = getDb();
      await db.delete(targets).where(inArray(targets.id, pending.map((p) => p.targetId)));
      revalidatePath("/", "layout");
    }
  }
  redirect(`/campaigns/${slug}/triagem`);
}
