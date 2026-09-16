import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns, scriptEdges, scriptGroupOptions, scriptGroups, scriptNodes } from "../src/db/schema";

/**
 * Converte o fluxo do modelo antigo (opção→opção, `script_edges`) pro modelo de
 * MENUS (opção→menu). Não perde nada: no modelo antigo, "os filhos de um passo"
 * JÁ ERA um menu — só não tinha nome nem identidade própria.
 *
 *   npx tsx scripts/migrate-fluxo-menus.ts [--force]
 *
 * Conjuntos de filhos idênticos viram o MESMO menu, então os 6 passos que
 * apontavam pras mesmas 8 reações passam a apontar pra um menu só — e é aí que
 * a manutenção despenca. Onde todas as opções de um menu levam pro mesmo lugar,
 * isso vira o PADRÃO do menu e os destinos por opção são limpos.
 *
 * Idempotente: carteira que já tem menus é pulada, salvo --force.
 */

const LARGURA = 360; // espaçamento horizontal entre colunas do canvas
const ALTURA = 240; // espaçamento vertical entre menus da mesma coluna

function nomeDoMenu(titulos: string[]): string {
  const primeiro = (titulos[0] ?? "Menu").replace(/\s+/g, " ").trim();
  const curto = primeiro.length > 30 ? `${primeiro.slice(0, 29)}…` : primeiro;
  return titulos.length > 1 ? `${curto} +${titulos.length - 1}` : curto;
}

async function converter(db: ReturnType<typeof getDb>, campaignId: string, nome: string, force: boolean) {
  const jaTem = await db.select({ id: scriptGroups.id }).from(scriptGroups).where(eq(scriptGroups.campaignId, campaignId));
  if (jaTem.length && !force) {
    console.log(`· ${nome}: já tem ${jaTem.length} menus, pulando (use --force)`);
    return;
  }
  if (jaTem.length) await db.delete(scriptGroups).where(eq(scriptGroups.campaignId, campaignId));

  const nos = await db
    .select()
    .from(scriptNodes)
    .where(eq(scriptNodes.campaignId, campaignId))
    .orderBy(asc(scriptNodes.ordem), asc(scriptNodes.createdAt));
  if (!nos.length) return;

  const porId = new Map(nos.map((n) => [n.id, n]));
  const arestas = await db.select().from(scriptEdges).orderBy(asc(scriptEdges.ordem));

  // pai → filhos, na ordem da aresta (só o que é desta carteira)
  const filhos = new Map<string, string[]>();
  for (const e of arestas) {
    if (!porId.has(e.fromId) || !porId.has(e.toId)) continue;
    filhos.set(e.fromId, [...(filhos.get(e.fromId) ?? []), e.toId]);
  }

  // conjunto de filhos idêntico ⇒ MESMO menu. É a chave da conversão.
  const menuPorChave = new Map<string, { id: string; opcoes: string[] }>();
  const criarMenu = async (opcoes: string[], entrada: boolean, forcarNome?: string) => {
    const chave = (entrada ? "ENTRADA:" : "") + opcoes.join(",");
    const existente = menuPorChave.get(chave);
    if (existente) return existente.id;
    const [menu] = await db
      .insert(scriptGroups)
      .values({
        campaignId,
        nome: forcarNome ?? nomeDoMenu(opcoes.map((id) => porId.get(id)?.titulo ?? "")),
        entrada,
      })
      .returning({ id: scriptGroups.id });
    await db.insert(scriptGroupOptions).values(opcoes.map((nodeId, ordem) => ({ groupId: menu.id, nodeId, ordem })));
    menuPorChave.set(chave, { id: menu.id, opcoes });
    return menu.id;
  };

  // o menu de entrada: as antigas aberturas viram as opções da primeira coluna
  const aberturas = nos.filter((n) => n.entrada).map((n) => n.id);
  const entradaId = aberturas.length ? await criarMenu(aberturas, true, "Abertura") : null;

  // cada passo que tinha filhos passa a apontar pro menu daquele conjunto
  for (const [paiId, lista] of filhos) {
    const menuId = await criarMenu(lista, false);
    await db.update(scriptNodes).set({ proximoId: menuId, updatedAt: new Date() }).where(eq(scriptNodes.id, paiId));
  }

  // o destino de uma opção é o menu do conjunto de filhos DELA
  const destinoDaOpcao = (id: string) => menuPorChave.get((filhos.get(id) ?? []).join(","))?.id ?? null;

  // PASSO 1 — padrão do menu: se todas as opções levam pro mesmo lugar, isso é
  // propriedade do menu, não de cada uma. É o que faz a próxima variação custar
  // zero ligação: ela nasce já apontando pro lugar certo.
  let padroes = 0;
  const padraoDoMenu = new Map<string, string | null>();
  for (const { id: menuId, opcoes } of menuPorChave.values()) {
    const alvos = opcoes.map(destinoDaOpcao);
    const primeiro = alvos[0];
    if (opcoes.length < 2 || !primeiro || !alvos.every((a) => a === primeiro)) continue;
    await db.update(scriptGroups).set({ padraoId: primeiro, updatedAt: new Date() }).where(eq(scriptGroups.id, menuId));
    padraoDoMenu.set(menuId, primeiro);
    padroes++;
  }

  // PASSO 2 — limpar o destino por opção, mas SÓ quando é seguro. A mesma opção
  // pode estar em vários menus: só dá pra apagar o destino dela se TODOS eles
  // tiverem esse mesmo padrão, senão ela passaria a seguir o padrão do outro.
  const menusDaOpcao = new Map<string, string[]>();
  for (const { id: menuId, opcoes } of menuPorChave.values()) {
    for (const op of opcoes) menusDaOpcao.set(op, [...(menusDaOpcao.get(op) ?? []), menuId]);
  }
  let limpas = 0;
  for (const [opcaoId, menusDela] of menusDaOpcao) {
    const alvo = destinoDaOpcao(opcaoId);
    if (!alvo) continue;
    if (!menusDela.every((m) => padraoDoMenu.get(m) === alvo)) continue;
    await db.update(scriptNodes).set({ proximoId: null, updatedAt: new Date() }).where(eq(scriptNodes.id, opcaoId));
    limpas++;
  }

  await posicionar(db, campaignId, entradaId);

  console.log(
    `✓ ${nome}: ${nos.length} opções → ${menuPorChave.size} menus · ` +
      `${padroes} com destino padrão · ${limpas} ligações por opção viraram desnecessárias`,
  );
}

/** Layout inicial do canvas: colunas por distância do menu de entrada. */
async function posicionar(db: ReturnType<typeof getDb>, campaignId: string, entradaId: string | null) {
  const menus = await db.select().from(scriptGroups).where(eq(scriptGroups.campaignId, campaignId));
  const opcoes = await db.select().from(scriptGroupOptions);
  const nos = await db.select().from(scriptNodes).where(eq(scriptNodes.campaignId, campaignId));
  const proximoDaOpcao = new Map(nos.map((n) => [n.id, n.proximoId]));
  const doMenu = new Map<string, string[]>();
  for (const o of opcoes) doMenu.set(o.groupId, [...(doMenu.get(o.groupId) ?? []), o.nodeId]);

  const saidas = (menuId: string) => {
    const m = menus.find((x) => x.id === menuId);
    const alvos = (doMenu.get(menuId) ?? []).map((n) => proximoDaOpcao.get(n) ?? m?.padraoId ?? null);
    return [...new Set(alvos.filter((a): a is string => Boolean(a)))];
  };

  const nivel = new Map<string, number>();
  const fila: string[] = entradaId ? [entradaId] : [];
  if (entradaId) nivel.set(entradaId, 0);
  while (fila.length) {
    const atual = fila.shift()!;
    for (const alvo of saidas(atual)) {
      if (nivel.has(alvo)) continue;
      nivel.set(alvo, (nivel.get(atual) ?? 0) + 1);
      fila.push(alvo);
    }
  }
  // menu que ninguém alcança vai pra uma faixa própria, no fim
  const maior = Math.max(0, ...nivel.values());
  for (const m of menus) if (!nivel.has(m.id)) nivel.set(m.id, maior + 1);

  const usadosPorNivel = new Map<number, number>();
  for (const m of menus) {
    const n = nivel.get(m.id) ?? 0;
    const linha = usadosPorNivel.get(n) ?? 0;
    usadosPorNivel.set(n, linha + 1);
    await db
      .update(scriptGroups)
      .set({ posX: n * LARGURA, posY: linha * ALTURA })
      .where(eq(scriptGroups.id, m.id));
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const db = getDb();
  const lista = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns);
  for (const c of lista) await converter(db, c.id, c.name, force);
  console.log("\nconversão concluída.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
