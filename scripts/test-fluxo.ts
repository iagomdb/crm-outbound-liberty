import "dotenv/config";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import { duplicarPasso } from "../src/core/script-flow-edit";
import { campaigns, scriptEdges, scriptNodes } from "../src/db/schema";

/**
 * Testa a duplicação de passo do fluxo contra o banco de verdade.
 *
 *   npx tsx scripts/test-fluxo.ts
 *
 * Cria uma carteira descartável, monta um grafo mínimo, duplica e confere que a
 * variação caiu no MESMO galho. Apaga a carteira no fim (cascade leva nós e
 * arestas junto) — não encosta em dado real.
 */

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("✗ FALHOU:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

async function main() {
  const db = getDb();
  const [carteira] = await db
    .insert(campaigns)
    .values({ name: `__teste-fluxo ${Date.now()}`, status: "arquivada" })
    .returning({ id: campaigns.id });

  try {
    const no = async (titulo: string, entrada: boolean, ordem = 0) => {
      const [r] = await db
        .insert(scriptNodes)
        .values({ campaignId: carteira.id, titulo, entrada, ordem, fala: `fala de ${titulo}` })
        .returning({ id: scriptNodes.id });
      return r.id;
    };

    // duas aberturas e um miolo compartilhado, como no fluxo de verdade
    const ab1 = await no("Abertura 1", true, 0);
    const ab2 = await no("Abertura 2", true, 1);
    const simA = await no("Deu os 30s", false);
    const naoA = await no("Negou", false);
    const objecao = await no("A1 sem interesse", false);

    await db.insert(scriptEdges).values([
      { fromId: ab1, toId: simA, ordem: 0 },
      { fromId: ab1, toId: naoA, ordem: 1 },
      { fromId: ab1, toId: objecao, ordem: 2 },
      { fromId: ab2, toId: simA, ordem: 0 },
    ]);

    // ---------------------------------------------------- duplicar uma ABERTURA
    const copiaId = await duplicarPasso(db, ab1);
    assert(Boolean(copiaId), "duplicar devolveu o id da cópia");

    const [copia] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, copiaId!));
    assert(copia.titulo === "Abertura 1 (variação)", `título marcado como variação (${copia.titulo})`);
    assert(copia.fala === "fala de Abertura 1", "fala copiada — é ponto de partida pra reescrever");
    assert(copia.entrada === true, "a cópia de uma abertura também é abertura");

    const filhosCopia = await db
      .select({ toId: scriptEdges.toId })
      .from(scriptEdges)
      .where(eq(scriptEdges.fromId, copiaId!))
      .orderBy(asc(scriptEdges.ordem));
    assert(filhosCopia.length === 3, `a variação herdou os 3 próximos passos (${filhosCopia.length})`);
    assert(
      filhosCopia.map((f) => f.toId).join() === [simA, naoA, objecao].join(),
      "e aponta pros MESMOS nós, na mesma ordem — cai no mesmo galho",
    );

    const [{ id: naoTocado } = { id: "" }] = await db
      .select({ id: scriptNodes.id })
      .from(scriptNodes)
      .where(and(eq(scriptNodes.campaignId, carteira.id), eq(scriptNodes.titulo, "Deu os 30s")));
    assert(naoTocado === simA, "o filho NÃO foi clonado — é o mesmo nó, a estatística não fragmenta");

    const aberturas = await db
      .select({ id: scriptNodes.id, titulo: scriptNodes.titulo })
      .from(scriptNodes)
      .where(and(eq(scriptNodes.campaignId, carteira.id), eq(scriptNodes.entrada, true)))
      .orderBy(asc(scriptNodes.ordem));
    assert(
      aberturas.map((a) => a.id).join() === [ab1, copiaId, ab2].join(),
      `a variação entra logo depois do original (${aberturas.map((a) => a.titulo).join(" | ")})`,
    );

    // ---------------------------------------------------- duplicar um passo do MIOLO
    const copiaMiolo = await duplicarPasso(db, simA);
    const paisDaCopia = await db
      .select({ fromId: scriptEdges.fromId, ordem: scriptEdges.ordem })
      .from(scriptEdges)
      .where(eq(scriptEdges.toId, copiaMiolo!));
    assert(
      paisDaCopia.length === 3,
      `variação do miolo ficou pendurada nos mesmos 3 pais (${paisDaCopia.length})`,
    );

    const colunaAb1 = await db
      .select({ toId: scriptEdges.toId })
      .from(scriptEdges)
      .where(eq(scriptEdges.fromId, ab1))
      .orderBy(asc(scriptEdges.ordem));
    assert(
      colunaAb1.map((e) => e.toId).join() === [simA, copiaMiolo, naoA, objecao].join(),
      "e entrou logo abaixo do original na coluna, sem embaralhar o resto",
    );

    const semPai = await duplicarPasso(db, "00000000-0000-0000-0000-000000000000");
    assert(semPai === null, "id inexistente devolve null em vez de estourar");

    console.log("\n✅ TODOS OS TESTES PASSARAM");
  } finally {
    await db.delete(campaigns).where(inArray(campaigns.id, [carteira.id]));
    console.log("carteira de teste apagada");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
