import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { scriptEdges, scriptNodes } from "../db/schema";

/**
 * Mutações do grafo do fluxo que são grandes demais pra viver dentro de uma
 * action. Mesma divisão de core/checklist.ts: fica fora das actions pra não
 * virar endpoint público — quem chama garante auth. Recebe o db, então dá pra
 * exercitar fora do Next (scripts/test-fluxo.ts).
 */

type DB = ReturnType<typeof getDb>;

/**
 * Duplica um passo como VARIAÇÃO: a cópia nasce no mesmo lugar (mesmos pais) e
 * apontando pros MESMOS próximos passos.
 *
 * É o atalho pro caso "abertura 1, 2 e 3 são redações diferentes que caem no
 * mesmo galho" — sem isto, cada abertura nova exigiria pendurar os oito filhos
 * na mão, um por um.
 *
 * Compartilha os filhos, NÃO clona a subárvore. Clonar fragmentaria a
 * estatística: o objetivo é medir qual redação converte melhor com o resto da
 * conversa igual. Se um galho precisar divergir depois, basta tirar dessa
 * variação o filho que não serve.
 *
 * A cópia entra logo depois do original em cada coluna onde ele aparece —
 * variação jogada no fim da lista não se compara com o olho.
 */
export async function duplicarPasso(db: DB, nodeId: string): Promise<string | null> {
  const [orig] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, nodeId));
  if (!orig) return null;

  // abre espaço na coluna das aberturas (as outras colunas são ordenadas pela aresta)
  if (orig.entrada) {
    await db
      .update(scriptNodes)
      .set({ ordem: sql`${scriptNodes.ordem} + 1` })
      .where(
        and(
          eq(scriptNodes.campaignId, orig.campaignId),
          eq(scriptNodes.entrada, true),
          gt(scriptNodes.ordem, orig.ordem),
        ),
      );
  }

  const [copia] = await db
    .insert(scriptNodes)
    .values({
      campaignId: orig.campaignId,
      kind: orig.kind,
      titulo: `${orig.titulo} (variação)`,
      fala: orig.fala,
      nota: orig.nota,
      entrada: orig.entrada,
      ordem: orig.entrada ? orig.ordem + 1 : 0,
    })
    .returning({ id: scriptNodes.id });

  // mesmos próximos passos: é isto que faz a variação cair no mesmo galho
  const saidas = await db
    .select({ toId: scriptEdges.toId, ordem: scriptEdges.ordem })
    .from(scriptEdges)
    .where(eq(scriptEdges.fromId, nodeId))
    .orderBy(asc(scriptEdges.ordem));
  if (saidas.length) {
    await db.insert(scriptEdges).values(saidas.map((e) => ({ fromId: copia.id, toId: e.toId, ordem: e.ordem })));
  }

  // mesmos pais: a cópia vira irmã do original, logo abaixo dele em cada coluna
  const entradas = await db
    .select({ fromId: scriptEdges.fromId, ordem: scriptEdges.ordem })
    .from(scriptEdges)
    .where(eq(scriptEdges.toId, nodeId));
  for (const e of entradas) {
    await db
      .update(scriptEdges)
      .set({ ordem: sql`${scriptEdges.ordem} + 1` })
      .where(and(eq(scriptEdges.fromId, e.fromId), gt(scriptEdges.ordem, e.ordem)));
    await db.insert(scriptEdges).values({ fromId: e.fromId, toId: copia.id, ordem: e.ordem + 1 });
  }

  return copia.id;
}
