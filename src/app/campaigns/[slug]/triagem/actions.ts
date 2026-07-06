"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, targets } from "@/db/schema";

/**
 * Decisão de triagem de ICP (roadmap Fase 1). Fica gravada na EMPRESA (global,
 * por CNPJ) — não retriar a mesma empresa em outra campanha. "Fora do ICP"
 * também arquiva o alvo: discar fora do ICP é tempo perdido.
 */
export async function triageCompany(companyId: string, targetId: string, fit: boolean) {
  const db = getDb();
  const now = new Date();
  await db.update(companies).set({ icpFit: fit, updatedAt: now }).where(eq(companies.id, companyId));
  if (!fit) {
    await db
      .update(targets)
      .set({ archivedAt: now, archiveReason: "fora do ICP", updatedAt: now })
      .where(eq(targets.id, targetId));
  }
  revalidatePath("/", "layout");
}
