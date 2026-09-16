import { and, asc, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { scriptGroupOptions, scriptGroups, scriptNodes } from "../db/schema";

/**
 * Mutações do fluxo grandes demais pra viver dentro de uma action. Mesma divisão
 * de core/checklist.ts: fica fora das actions pra não virar endpoint público —
 * quem chama garante auth. Recebe o db, então dá pra exercitar fora do Next
 * (scripts/test-fluxo.ts).
 *
 * O modelo de MENUS matou dois verbos que existiam no modelo antigo:
 *   · "cair no mesmo galho" virou escolher o mesmo menu de destino (um update)
 *   · "pendurar passo existente" virou pôr a opção no menu (uma linha de N:N)
 * Sobrou o que é de fato conteúdo: duplicar uma redação e fundir repetidas.
 */

type DB = ReturnType<typeof getDb>;

/** Próxima posição livre dentro de um menu. */
async function proximaOrdem(db: DB, groupId: string) {
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${scriptGroupOptions.ordem}), -1)` })
    .from(scriptGroupOptions)
    .where(eq(scriptGroupOptions.groupId, groupId));
  return (r?.max ?? -1) + 1;
}

/**
 * Duplica uma opção como VARIAÇÃO: mesma fala, mesmo menu, mesmo destino, logo
 * abaixo da original. Pra testar outra redação com o resto da conversa igual.
 *
 * No modelo de menus isso ficou trivial — a cópia não precisa herdar ligação
 * nenhuma, porque quem manda no destino é o menu. Antes custava copiar as
 * arestas de entrada e de saída na mão.
 */
export async function duplicarOpcao(db: DB, groupId: string, opcaoId: string): Promise<string | null> {
  const [orig] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, opcaoId));
  const [vinculo] = await db
    .select({ ordem: scriptGroupOptions.ordem })
    .from(scriptGroupOptions)
    .where(and(eq(scriptGroupOptions.groupId, groupId), eq(scriptGroupOptions.nodeId, opcaoId)));
  if (!orig || !vinculo) return null;

  // abre espaço pra cópia entrar logo abaixo da original
  await db
    .update(scriptGroupOptions)
    .set({ ordem: sql`${scriptGroupOptions.ordem} + 1` })
    .where(and(eq(scriptGroupOptions.groupId, groupId), sql`${scriptGroupOptions.ordem} > ${vinculo.ordem}`));

  const [copia] = await db
    .insert(scriptNodes)
    .values({
      campaignId: orig.campaignId,
      kind: orig.kind,
      titulo: `${orig.titulo} (variação)`,
      fala: orig.fala,
      nota: orig.nota,
      proximoId: orig.proximoId,
    })
    .returning({ id: scriptNodes.id });

  await db
    .insert(scriptGroupOptions)
    .values({ groupId, nodeId: copia.id, ordem: vinculo.ordem + 1 });

  return copia.id;
}

/**
 * Funde duas opções que dizem a MESMA coisa: `manter` absorve `absorvido`, que
 * deixa de existir.
 *
 * O conserto pra quando a mesma fala virou duas opções em menus diferentes — aí
 * melhorar o texto exige editar nos dois e a estatística sai partida. Depois da
 * fusão é uma opção só, presente nos dois menus.
 *
 * Fica o conteúdo de `manter` (o texto do absorvido se perde, por isso quem
 * chama avisa antes) e ela herda as PRESENÇAS do outro: todo menu que tinha o
 * absorvido passa a ter este. O histórico é remapeado junto, senão o Aprendizado
 * mostraria duas linhas pro mesmo movimento — uma de uma opção que não existe.
 */
export async function fundirOpcoes(db: DB, manterId: string, absorvidoId: string): Promise<boolean> {
  if (!manterId || !absorvidoId || manterId === absorvidoId) return false;

  const [manter] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, manterId));
  const [absorvido] = await db.select().from(scriptNodes).where(eq(scriptNodes.id, absorvidoId));
  if (!manter || !absorvido || manter.campaignId !== absorvido.campaignId) return false;

  const presencas = await db
    .select({ groupId: scriptGroupOptions.groupId, ordem: scriptGroupOptions.ordem })
    .from(scriptGroupOptions)
    .where(eq(scriptGroupOptions.nodeId, absorvidoId))
    .orderBy(asc(scriptGroupOptions.ordem));

  for (const p of presencas) {
    const [ja] = await db
      .select({ id: scriptGroupOptions.id })
      .from(scriptGroupOptions)
      .where(and(eq(scriptGroupOptions.groupId, p.groupId), eq(scriptGroupOptions.nodeId, manterId)));
    if (ja) continue; // esse menu já tinha as duas
    await db.insert(scriptGroupOptions).values({ groupId: p.groupId, nodeId: manterId, ordem: p.ordem });
  }

  // sem destino próprio, a que fica assume o do absorvido (melhor que perder)
  if (!manter.proximoId && absorvido.proximoId) {
    await db
      .update(scriptNodes)
      .set({ proximoId: absorvido.proximoId, updatedAt: new Date() })
      .where(eq(scriptNodes.id, manterId));
  }

  await db.execute(sql`
    update activities
    set caminho = (
      select jsonb_agg(
        case when passo->>'nodeId' = ${absorvidoId}
          then jsonb_build_object('nodeId', ${manterId}::text, 'titulo', ${manter.titulo}::text, 'kind', ${manter.kind}::text)
          else passo
        end
        order by pos
      )
      from jsonb_array_elements(activities.caminho) with ordinality as t(passo, pos)
    )
    where activities.caminho @> ${JSON.stringify([{ nodeId: absorvidoId }])}::jsonb
  `);

  // as presenças do absorvido vão junto por cascade
  await db.delete(scriptNodes).where(eq(scriptNodes.id, absorvidoId));
  return true;
}

/**
 * Duplica um MENU: as MESMAS opções (não cópias delas — opção é compartilhada de
 * propósito, é o que mantém a estatística inteira) e **nenhum destino**.
 *
 * Nasce sem padrão de propósito. Duplicar menu nunca foi sobre repetir texto —
 * pra isso a opção já vive em vários menus de uma vez. O único motivo pra
 * duplicar é mandar o mesmo conjunto de escolhas pra OUTRO lugar, então herdar o
 * destino do original seria justamente o contrário do que se pediu.
 *
 * Ressalva: opção com destino PRÓPRIO leva esse destino junto, porque ele mora
 * na opção e ela é a mesma nos dois menus. Só o padrão é por menu.
 */
export async function duplicarMenu(db: DB, menuId: string): Promise<string | null> {
  const [orig] = await db.select().from(scriptGroups).where(eq(scriptGroups.id, menuId));
  if (!orig) return null;

  const [copia] = await db
    .insert(scriptGroups)
    .values({
      campaignId: orig.campaignId,
      nome: `${orig.nome} 2`,
      entrada: false, // só um menu de entrada por carteira
      padraoId: null, // o destino é o que você vai mudar — nasce em branco
      posX: orig.posX + 40,
      posY: orig.posY + 40,
    })
    .returning({ id: scriptGroups.id });

  const opcoes = await db
    .select({ nodeId: scriptGroupOptions.nodeId, ordem: scriptGroupOptions.ordem })
    .from(scriptGroupOptions)
    .where(eq(scriptGroupOptions.groupId, menuId))
    .orderBy(asc(scriptGroupOptions.ordem));
  if (opcoes.length) {
    await db.insert(scriptGroupOptions).values(opcoes.map((o) => ({ groupId: copia.id, nodeId: o.nodeId, ordem: o.ordem })));
  }

  return copia.id;
}

/** Garante que só um menu da carteira é a entrada. */
export async function definirEntrada(db: DB, campaignId: string, menuId: string) {
  await db
    .update(scriptGroups)
    .set({ entrada: false, updatedAt: new Date() })
    .where(and(eq(scriptGroups.campaignId, campaignId), eq(scriptGroups.entrada, true)));
  await db.update(scriptGroups).set({ entrada: true, updatedAt: new Date() }).where(eq(scriptGroups.id, menuId));
}

export { proximaOrdem as proximaOrdemNoMenu };
