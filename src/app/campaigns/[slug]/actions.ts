"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { targets } from "@/db/schema";
import type { Stage } from "@/core/pipeline";
import { isCycleEnd, resolveTask } from "@/core/tasks";

/**
 * Move um card de coluna (kanban): muda estágio, registra data e conta o movimento.
 * Fim de ciclo vale aqui também (regra de ouro): terminal limpa a task;
 * `nao_agora` reentra com task longa se não tinha nenhuma.
 */
export async function moveTarget(targetId: string, newStage: string) {
  await requireUser();
  const db = getDb();
  const now = new Date();
  const stage = newStage as Stage;

  const [cur] = await db
    .select({ nextActionAt: targets.nextActionAt, nextActionPretext: targets.nextActionPretext })
    .from(targets)
    .where(eq(targets.id, targetId));
  const task = isCycleEnd(stage)
    ? resolveTask(stage, { nextActionAt: cur?.nextActionAt ?? null, nextActionPretext: cur?.nextActionPretext ?? null }, now)
    : null;

  await db
    .update(targets)
    .set({
      stage,
      stageChangedAt: now,
      moves: sql`${targets.moves} + 1`,
      updatedAt: now,
      ...(task ? { nextActionAt: task.nextActionAt, nextActionPretext: task.nextActionPretext } : {}),
    })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

/** Arquiva um lead (tira do board), guardando o motivo. */
export async function archiveTarget(targetId: string, reason: string) {
  await requireUser();
  const db = getDb();
  const now = new Date();
  await db
    .update(targets)
    .set({ archivedAt: now, archiveReason: reason || null, updatedAt: now })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}
