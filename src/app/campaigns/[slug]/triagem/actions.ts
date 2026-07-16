"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { companies, targets } from "@/db/schema";

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
