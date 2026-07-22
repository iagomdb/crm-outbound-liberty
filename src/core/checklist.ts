import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "../db";
import { campaigns, checklistItems, checklistOptions } from "../db/schema";

// Lógica de negócio do checklist da carteira (padrão roteiro/passos):
// replace-all preservando ordem, e cópia entre carteiras (hipótese copiável).
// Fica fora das actions pra não virar endpoint público — quem chama garante auth.

type DB = ReturnType<typeof getDb>;

// O editor manda os itens serializados num hidden input.
// Item com "opcoes" vira categoria de escolha única (teste A/B de abordagem).
const checklistSchema = z.array(
  z.object({
    titulo: z.string().trim().min(1),
    descricao: z.string().trim().optional(),
    opcoes: z.array(z.string().trim().min(1)).optional(),
  }),
);

type ChecklistInput = z.infer<typeof checklistSchema>;

/** Substitui (replace-all) os itens do checklist da carteira, preservando a ordem. */
async function replaceChecklist(db: DB, campaignId: string, items: ChecklistInput) {
  await db.delete(checklistItems).where(eq(checklistItems.campaignId, campaignId));
  for (const [idx, item] of items.entries()) {
    const [created] = await db
      .insert(checklistItems)
      .values({ campaignId, titulo: item.titulo, descricao: item.descricao || null, ordem: idx })
      .returning({ id: checklistItems.id });
    if (item.opcoes?.length) {
      await db
        .insert(checklistOptions)
        .values(item.opcoes.map((titulo, oi) => ({ itemId: created.id, titulo, ordem: oi })));
    }
  }
}

/** JSON do editor (hidden input) → replace-all validado. */
export async function replaceChecklistFromJson(db: DB, campaignId: string, raw: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw || "[]");
  } catch {
    throw new Error("checklist inválido");
  }
  const parsed = checklistSchema.safeParse(json);
  if (!parsed.success) throw new Error("checklist inválido");
  await replaceChecklist(db, campaignId, parsed.data);
}

/**
 * Duplica a hipótese (pitch + checklist) de uma carteira pra outra.
 * Cópia independente: editar uma não afeta a outra. Sobrescreve o destino.
 */
export async function copyPlaybook(db: DB, fromCampaignId: string, toCampaignId: string) {
  const [from] = await db.select({ script: campaigns.script }).from(campaigns).where(eq(campaigns.id, fromCampaignId));
  if (!from) throw new Error("carteira de origem não encontrada");

  await db
    .update(campaigns)
    .set({ script: from.script, updatedAt: new Date() })
    .where(eq(campaigns.id, toCampaignId));

  const items = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.campaignId, fromCampaignId))
    .orderBy(asc(checklistItems.ordem), asc(checklistItems.createdAt));

  const opcoesPorItem = new Map<string, { titulo: string }[]>();
  for (const item of items) {
    const ops = await db
      .select({ titulo: checklistOptions.titulo })
      .from(checklistOptions)
      .where(eq(checklistOptions.itemId, item.id))
      .orderBy(asc(checklistOptions.ordem), asc(checklistOptions.createdAt));
    opcoesPorItem.set(item.id, ops);
  }

  await replaceChecklist(
    db,
    toCampaignId,
    items.map((i) => ({
      titulo: i.titulo,
      descricao: i.descricao ?? undefined,
      opcoes: opcoesPorItem.get(i.id)?.map((o) => o.titulo),
    })),
  );
}
