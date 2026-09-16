import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { definirEntrada, duplicarMenu, duplicarOpcao, fundirOpcoes } from "../src/core/script-flow-edit";
import { colunasDoCaminho, destinoDe, indexGraph, type FlowGraph } from "../src/core/script-flow";
import {
  activities,
  campaigns,
  companies,
  scriptGroupOptions,
  scriptGroups,
  scriptNodes,
  targets,
} from "../src/db/schema";

/**
 * Testa o fluxo em MENUS contra o banco de verdade.
 *
 *   npx tsx scripts/test-fluxo.ts
 *
 * Cria uma carteira descartável, monta menus, e confere o que sustenta o
 * modelo: destino padrão vs destino de opção, variação que não custa ligação,
 * reuso da mesma opção em dois menus, e fusão sem perder histórico.
 *
 * Apaga carteira e empresa no fim — não encosta em dado real.
 */

class Falhou extends Error {}

function assert(cond: boolean, msg: string) {
  // throw, não process.exit: exit pularia o finally e deixaria lixo no banco
  if (!cond) throw new Falhou(msg);
  console.log("✓", msg);
}

async function main() {
  const db = getDb();
  const [carteira] = await db
    .insert(campaigns)
    .values({ name: `__teste-fluxo ${Date.now()}`, status: "arquivada" })
    .returning({ id: campaigns.id });

  try {
    const menu = async (nome: string, entrada = false) => {
      const [m] = await db
        .insert(scriptGroups)
        .values({ campaignId: carteira.id, nome, entrada })
        .returning({ id: scriptGroups.id });
      return m.id;
    };
    const opcao = async (groupId: string, titulo: string, ordem: number) => {
      const [o] = await db
        .insert(scriptNodes)
        .values({ campaignId: carteira.id, titulo, fala: `fala de ${titulo}` })
        .returning({ id: scriptNodes.id });
      await db.insert(scriptGroupOptions).values({ groupId, nodeId: o.id, ordem });
      return o.id;
    };
    const grafo = async (): Promise<FlowGraph> => {
      const menus = await db.select().from(scriptGroups).where(eq(scriptGroups.campaignId, carteira.id));
      const linhas = await db
        .select({ groupId: scriptGroupOptions.groupId, node: scriptNodes, ordem: scriptGroupOptions.ordem })
        .from(scriptGroupOptions)
        .innerJoin(scriptNodes, eq(scriptGroupOptions.nodeId, scriptNodes.id))
        .orderBy(asc(scriptGroupOptions.ordem));
      return {
        menus: menus.map((m) => ({
          id: m.id,
          nome: m.nome,
          entrada: m.entrada,
          padraoId: m.padraoId,
          posX: m.posX,
          posY: m.posY,
          opcoes: linhas
            .filter((l) => l.groupId === m.id)
            .map((l) => ({
              id: l.node.id,
              kind: l.node.kind,
              titulo: l.node.titulo,
              fala: l.node.fala,
              nota: l.node.nota,
              proximoId: l.node.proximoId,
            })),
        })),
      };
    };

    // 3 lines caindo num miolo comum — o caso que motivou o modelo
    const mAbertura = await menu("Abertura", true);
    const mReacao = await menu("Reação");
    const mObjecoes = await menu("Objeções");
    const a1 = await opcao(mAbertura, "A1 contexto", 0);
    const a2 = await opcao(mAbertura, "A2 humor", 1);
    const a3 = await opcao(mAbertura, "A3 untailored", 2);
    const deuOs30 = await opcao(mReacao, "Deu os 30s", 0);
    await opcao(mReacao, "Negou", 1);
    await opcao(mObjecoes, "Sem tempo", 0);

    // UMA configuração liga as três aberturas ao miolo
    await db.update(scriptGroups).set({ padraoId: mReacao }).where(eq(scriptGroups.id, mAbertura));

    console.log("-- destino: padrão do menu vs destino da opção --");
    let ix = indexGraph(await grafo());
    assert(
      destinoDe(ix, { menuId: mAbertura, opcaoId: a1 })?.id === mReacao &&
        destinoDe(ix, { menuId: mAbertura, opcaoId: a2 })?.id === mReacao &&
        destinoDe(ix, { menuId: mAbertura, opcaoId: a3 })?.id === mReacao,
      "as 3 aberturas caem no mesmo menu com UMA configuração (o padrão)",
    );

    // a exceção: uma opção que foge do padrão
    await db.update(scriptNodes).set({ proximoId: mObjecoes }).where(eq(scriptNodes.id, a3));
    ix = indexGraph(await grafo());
    assert(
      destinoDe(ix, { menuId: mAbertura, opcaoId: a3 })?.id === mObjecoes,
      "o destino da opção vence o padrão do menu",
    );
    assert(
      destinoDe(ix, { menuId: mAbertura, opcaoId: a1 })?.id === mReacao,
      "e a exceção de uma não mexe nas outras",
    );

    console.log("\n-- variação custa zero ligação --");
    const antesDeVariar = destinoDe(ix, { menuId: mAbertura, opcaoId: a1 })?.id;
    const variacaoId = await duplicarOpcao(db, mAbertura, a1);
    assert(Boolean(variacaoId), "duplicar devolveu o id da variação");
    ix = indexGraph(await grafo());
    const [copia] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, variacaoId!));
    assert(copia.titulo === "A1 contexto (variação)", `título marcado como variação (${copia.titulo})`);
    assert(copia.fala === "fala de A1 contexto", "fala copiada — ponto de partida pra reescrever");
    assert(
      destinoDe(ix, { menuId: mAbertura, opcaoId: variacaoId! })?.id === antesDeVariar,
      "a variação já nasce indo pro lugar certo, SEM ligação nenhuma criada",
    );
    const ordemNoMenu = await db
      .select({ nodeId: scriptGroupOptions.nodeId })
      .from(scriptGroupOptions)
      .where(eq(scriptGroupOptions.groupId, mAbertura))
      .orderBy(asc(scriptGroupOptions.ordem));
    assert(
      ordemNoMenu.map((o) => o.nodeId).join() === [a1, variacaoId, a2, a3].join(),
      "e entra logo abaixo da original, sem embaralhar o menu",
    );

    console.log("\n-- a mesma opção em dois menus --");
    await db.insert(scriptGroupOptions).values({ groupId: mObjecoes, nodeId: deuOs30, ordem: 1 });
    ix = indexGraph(await grafo());
    assert(ix.menusDaOpcao.get(deuOs30)?.length === 2, "a opção aparece em 2 menus sendo a MESMA opção");
    await db.update(scriptGroups).set({ padraoId: mObjecoes }).where(eq(scriptGroups.id, mReacao));
    ix = indexGraph(await grafo());
    assert(
      destinoDe(ix, { menuId: mReacao, opcaoId: deuOs30 })?.id === mObjecoes &&
        destinoDe(ix, { menuId: mObjecoes, opcaoId: deuOs30 }) === null,
      "e o destino dela depende do menu de onde foi clicada",
    );

    console.log("\n-- colunas da discagem --");
    const cols = colunasDoCaminho(ix, [{ menuId: mAbertura, opcaoId: a1 }]);
    assert(
      cols.length === 2 && cols[0].menu.id === mAbertura && cols[1].menu.id === mReacao,
      `clicar a abertura abre a coluna do destino (${cols.length} colunas)`,
    );

    console.log("\n-- duplicar menu --");
    const copiaMenu = await duplicarMenu(db, mAbertura);
    ix = indexGraph(await grafo());
    const novo = ix.menus.get(copiaMenu!)!;
    const original = ix.menus.get(mAbertura)!;
    assert(novo.opcoes.length === 4, `o menu copiado tem as mesmas 4 opções (${novo.opcoes.length})`);
    assert(novo.opcoes[0].id === a1, "que são as MESMAS opções, não cópias — estatística inteira");
    assert(novo.entrada === false, "e a cópia não vira início (só um por carteira)");
    assert(
      Boolean(original.padraoId) && novo.padraoId === null,
      "e nasce SEM destino: duplicar menu é pra mandar o mesmo grupo pra outro lugar",
    );

    console.log("\n-- fundir opções repetidas --");
    const [alvo] = await db.insert(companies).values({ razaoSocial: "__teste fluxo ltda" }).returning({ id: companies.id });
    const [tgt] = await db
      .insert(targets)
      .values({ campaignId: carteira.id, companyId: alvo.id })
      .returning({ id: targets.id });
    await db.insert(activities).values({
      targetId: tgt.id,
      reachedHuman: true,
      objectiveHit: "reuniao",
      caminho: [{ nodeId: a2, titulo: "A2 humor", kind: "fala" }],
    });

    assert((await fundirOpcoes(db, a1, a2)) === true, "fundir devolveu sucesso");
    const sumiu = await db.select({ id: scriptNodes.id }).from(scriptNodes).where(eq(scriptNodes.id, a2));
    assert(sumiu.length === 0, "a opção absorvida deixou de existir");
    const [act] = await db.select({ caminho: activities.caminho }).from(activities).where(eq(activities.targetId, tgt.id));
    assert(
      act.caminho?.[0].nodeId === a1 && act.caminho[0].titulo === "A1 contexto",
      "histórico remapeado — o Aprendizado conta as duas juntas",
    );
    const aindaNoMenu = await db
      .select({ id: scriptGroupOptions.id })
      .from(scriptGroupOptions)
      .where(and(eq(scriptGroupOptions.groupId, mAbertura), eq(scriptGroupOptions.nodeId, a1)));
    assert(aindaNoMenu.length === 1, "e a que ficou continua no menu uma vez só (sem duplicar presença)");

    assert((await fundirOpcoes(db, a1, a1)) === false, "fundir uma opção com ela mesma é no-op");

    console.log("\n-- entrada única --");
    await definirEntrada(db, carteira.id, mObjecoes);
    const entradas = await db
      .select({ id: scriptGroups.id })
      .from(scriptGroups)
      .where(and(eq(scriptGroups.campaignId, carteira.id), eq(scriptGroups.entrada, true)));
    assert(entradas.length === 1 && entradas[0].id === mObjecoes, "marcar um início desmarca o anterior");

    console.log("\n✅ TODOS OS TESTES PASSARAM");
  } finally {
    await db.delete(campaigns).where(eq(campaigns.id, carteira.id));
    await db.delete(companies).where(eq(companies.razaoSocial, "__teste fluxo ltda"));
    console.log("carteira e empresa de teste apagadas");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Falhou ? `✗ FALHOU: ${e.message}` : e);
    process.exit(1);
  });
