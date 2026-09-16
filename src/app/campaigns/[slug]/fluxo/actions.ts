"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { scriptEdges, scriptNodes } from "@/db/schema";
import type { NodeKind } from "@/core/script-flow";
import { duplicarPasso } from "@/core/script-flow-edit";

// Edição do FLUXO (grafo do script da carteira). Uma operação por action: o
// editor é a mesma tela de colunas da discagem, então cada mexida é pequena e
// volta renderizada no mesmo roundtrip (revalidatePath).

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const kind = (v: FormDataEntryValue | null): NodeKind => {
  const k = s(v);
  return k === "reacao" || k === "saida" ? k : "fala";
};

const refresh = () => revalidatePath("/", "layout");

/** Próxima posição livre entre os irmãos (filhos de `paiId`, ou as aberturas). */
async function proximaOrdem(db: ReturnType<typeof getDb>, campaignId: string, paiId: string | null) {
  if (paiId) {
    const [r] = await db
      .select({ max: sql<number>`coalesce(max(${scriptEdges.ordem}), -1)` })
      .from(scriptEdges)
      .where(eq(scriptEdges.fromId, paiId));
    return (r?.max ?? -1) + 1;
  }
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${scriptNodes.ordem}), -1)` })
    .from(scriptNodes)
    .where(and(eq(scriptNodes.campaignId, campaignId), eq(scriptNodes.entrada, true)));
  return (r?.max ?? -1) + 1;
}

export type CriarState = { novoId?: string; erro?: string };

/**
 * Cria um passo. Sem `paiId` ele nasce como ABERTURA (primeira coluna); com
 * `paiId`, nasce pendurado naquele passo. Devolve o id pro editor já abrir o nó
 * novo — montar um fluxo é criar e preencher em sequência.
 */
export async function criarNo(
  campaignId: string,
  paiId: string | null,
  _prev: CriarState,
  fd: FormData,
): Promise<CriarState> {
  await requireUser();
  const titulo = s(fd.get("titulo"));
  if (!titulo) return { erro: "título obrigatório" };

  const db = getDb();
  const ordem = await proximaOrdem(db, campaignId, paiId);
  const [novo] = await db
    .insert(scriptNodes)
    .values({ campaignId, titulo, kind: kind(fd.get("kind")), entrada: !paiId, ordem })
    .returning({ id: scriptNodes.id });

  if (paiId) await db.insert(scriptEdges).values({ fromId: paiId, toId: novo.id, ordem });

  refresh();
  return { novoId: novo.id };
}

export type DuplicarState = { novoId?: string; erro?: string };

/**
 * Duplica o passo como VARIAÇÃO: a cópia nasce no mesmo lugar (mesmos pais) e
 * apontando pros MESMOS próximos passos. É o atalho pro caso "abertura 1, 2 e 3
 * são redações diferentes que caem no mesmo galho" — sem isto, cada abertura
 * nova exigiria pendurar os oito filhos na mão, um por um.
 *
 * A cópia compartilha os filhos, não clona a subárvore. Clonar fragmentaria a
 * estatística: o objetivo é medir qual REDAÇÃO converte melhor, com o resto da
 * conversa igual. Se um galho precisar divergir depois, é só "tirar deste
 * galho" o filho que não serve pra essa variação.
 *
 * A mecânica mora em core/script-flow-edit.ts (testável fora do Next).
 *
 * Só recebe o id: o `(prev, formData)` que o useActionState manda é ignorado —
 * não há nada pra ler do form, e devolver o id da cópia é o que importa (o
 * editor abre ela na hora pra você reescrever a fala).
 */
export async function duplicarNo(nodeId: string): Promise<DuplicarState> {
  await requireUser();
  const novoId = await duplicarPasso(getDb(), nodeId);
  if (!novoId) return { erro: "passo não encontrado" };
  refresh();
  return { novoId };
}

/** Salva o conteúdo do passo — é o mesmo nó em todos os galhos onde ele aparece. */
export async function atualizarNo(nodeId: string, fd: FormData) {
  await requireUser();
  const titulo = s(fd.get("titulo"));
  if (!titulo) throw new Error("título obrigatório");

  await getDb()
    .update(scriptNodes)
    .set({
      titulo,
      kind: kind(fd.get("kind")),
      fala: s(fd.get("fala")) || null,
      nota: s(fd.get("nota")) || null,
      entrada: s(fd.get("entrada")) === "on",
      updatedAt: new Date(),
    })
    .where(eq(scriptNodes.id, nodeId));
  refresh();
}

/** Apaga o passo de vez — some de TODOS os galhos, junto com as arestas dele. */
export async function apagarNo(nodeId: string) {
  await requireUser();
  await getDb().delete(scriptNodes).where(eq(scriptNodes.id, nodeId));
  refresh();
}

/**
 * Pendura um passo que já existe embaixo de outro — o reuso que faz disto um
 * grafo. É assim que "manda no zap" vira filho da abertura E da CTA sem virar
 * duas cópias. Ignora repetição e auto-ligação.
 */
export async function ligarExistente(paiId: string, toId: string) {
  await requireUser();
  if (!toId || paiId === toId) return;
  const db = getDb();
  const [ja] = await db
    .select({ id: scriptEdges.id })
    .from(scriptEdges)
    .where(and(eq(scriptEdges.fromId, paiId), eq(scriptEdges.toId, toId)));
  if (ja) return;

  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${scriptEdges.ordem}), -1)` })
    .from(scriptEdges)
    .where(eq(scriptEdges.fromId, paiId));
  await db.insert(scriptEdges).values({ fromId: paiId, toId, ordem: (r?.max ?? -1) + 1 });
  refresh();
}

/** Tira o passo DESTE galho só. O nó continua vivo nos outros pais (e na lista de soltos). */
export async function desligar(fromId: string, toId: string) {
  await requireUser();
  await getDb().delete(scriptEdges).where(and(eq(scriptEdges.fromId, fromId), eq(scriptEdges.toId, toId)));
  refresh();
}

/** Marca/desmarca o passo como abertura (entra ou sai da primeira coluna). */
export async function alternarEntrada(campaignId: string, nodeId: string, entrada: boolean) {
  await requireUser();
  const db = getDb();
  const ordem = entrada ? await proximaOrdem(db, campaignId, null) : 0;
  await db.update(scriptNodes).set({ entrada, ordem, updatedAt: new Date() }).where(eq(scriptNodes.id, nodeId));
  refresh();
}

/**
 * Sobe/desce o passo dentro da coluna em que ele está. Entre irmãos de um pai,
 * troca a ordem das ARESTAS (a posição é do galho, não do nó — o mesmo nó pode
 * ser o 1º num pai e o 3º em outro). Na coluna das aberturas, troca a ordem dos
 * próprios nós.
 */
export async function moverNo(nodeId: string, paiId: string | null, dir: -1 | 1) {
  await requireUser();
  const db = getDb();

  if (paiId) {
    const irmaos = await db
      .select({ id: scriptEdges.id, toId: scriptEdges.toId, ordem: scriptEdges.ordem })
      .from(scriptEdges)
      .where(eq(scriptEdges.fromId, paiId))
      .orderBy(scriptEdges.ordem);
    const i = irmaos.findIndex((e) => e.toId === nodeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= irmaos.length) return;
    // reescreve a coluna inteira: ordens duplicadas ou com buraco viram no-op na troca
    const reordenado = [...irmaos];
    [reordenado[i], reordenado[j]] = [reordenado[j], reordenado[i]];
    await Promise.all(
      reordenado.map((e, idx) => db.update(scriptEdges).set({ ordem: idx }).where(eq(scriptEdges.id, e.id))),
    );
  } else {
    const [alvo] = await db.select({ campaignId: scriptNodes.campaignId }).from(scriptNodes).where(eq(scriptNodes.id, nodeId));
    if (!alvo) return;
    const irmaos = await db
      .select({ id: scriptNodes.id, ordem: scriptNodes.ordem })
      .from(scriptNodes)
      .where(and(eq(scriptNodes.campaignId, alvo.campaignId), eq(scriptNodes.entrada, true)))
      .orderBy(scriptNodes.ordem);
    const i = irmaos.findIndex((n) => n.id === nodeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= irmaos.length) return;
    const reordenado = [...irmaos];
    [reordenado[i], reordenado[j]] = [reordenado[j], reordenado[i]];
    await Promise.all(
      reordenado.map((n, idx) => db.update(scriptNodes).set({ ordem: idx }).where(eq(scriptNodes.id, n.id))),
    );
  }
  refresh();
}

/** Apaga o fluxo inteiro da carteira (zona de perigo do editor). */
export async function limparFluxo(campaignId: string) {
  await requireUser();
  const db = getDb();
  const ids = (
    await db.select({ id: scriptNodes.id }).from(scriptNodes).where(eq(scriptNodes.campaignId, campaignId))
  ).map((n) => n.id);
  if (ids.length) await db.delete(scriptNodes).where(inArray(scriptNodes.id, ids));
  refresh();
}
