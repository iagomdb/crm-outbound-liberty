"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { scriptGroupOptions, scriptGroups, scriptNodes } from "@/db/schema";
import type { NodeKind } from "@/core/script-flow";
import {
  definirEntrada,
  duplicarMenu,
  duplicarOpcao,
  fundirOpcoes,
  proximaOrdemNoMenu,
} from "@/core/script-flow-edit";

// Edição do FLUXO em MENUS. Uma operação por action: o canvas é otimista na
// posição (arrastar não pode piscar), mas todo o resto volta renderizado no
// mesmo roundtrip via revalidatePath.

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const kind = (v: FormDataEntryValue | null): NodeKind => {
  const k = s(v);
  return k === "reacao" || k === "saida" ? k : "fala";
};

const refresh = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------- menus

export type CriarState = { novoId?: string; erro?: string };

/** Cria um menu vazio. O canvas manda onde soltou o clique. */
export async function criarMenu(
  campaignId: string,
  posX: number,
  posY: number,
  _prev: CriarState,
  fd: FormData,
): Promise<CriarState> {
  await requireUser();
  const db = getDb();
  const nome = s(fd.get("nome")) || "Novo menu";
  const [menu] = await db
    .insert(scriptGroups)
    .values({ campaignId, nome, posX: Math.round(posX), posY: Math.round(posY) })
    .returning({ id: scriptGroups.id });

  // primeiro menu da carteira vira a entrada sozinho — senão o fluxo não começa
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scriptGroups)
    .where(eq(scriptGroups.campaignId, campaignId));
  if (n === 1) await definirEntrada(db, campaignId, menu.id);

  refresh();
  return { novoId: menu.id };
}

export async function renomearMenu(menuId: string, fd: FormData) {
  await requireUser();
  const nome = s(fd.get("nome"));
  if (!nome) return;
  await getDb().update(scriptGroups).set({ nome, updatedAt: new Date() }).where(eq(scriptGroups.id, menuId));
  refresh();
}

/** Apaga o menu. As opções dentro dele continuam existindo (viram soltas). */
export async function apagarMenu(menuId: string) {
  await requireUser();
  await getDb().delete(scriptGroups).where(eq(scriptGroups.id, menuId));
  refresh();
}

/** Posição no canvas. Sem revalidate: arrastar não pode re-renderizar a tela. */
export async function moverMenu(menuId: string, posX: number, posY: number) {
  await requireUser();
  await getDb()
    .update(scriptGroups)
    .set({ posX: Math.round(posX), posY: Math.round(posY) })
    .where(eq(scriptGroups.id, menuId));
}

/** O "Default" do card: destino de toda opção que não tem o seu. */
export async function definirPadrao(menuId: string, destinoId: string | null) {
  await requireUser();
  if (destinoId === menuId) return; // auto-laço no padrão trava a conversa
  await getDb()
    .update(scriptGroups)
    .set({ padraoId: destinoId, updatedAt: new Date() })
    .where(eq(scriptGroups.id, menuId));
  refresh();
}

export async function definirEntradaMenu(campaignId: string, menuId: string) {
  await requireUser();
  await definirEntrada(getDb(), campaignId, menuId);
  refresh();
}

export async function duplicarMenuAction(menuId: string) {
  await requireUser();
  await duplicarMenu(getDb(), menuId);
  refresh();
}

// ---------------------------------------------------------------- opções

/** Cria uma opção dentro de um menu. */
export async function criarOpcao(
  campaignId: string,
  menuId: string,
  _prev: CriarState,
  fd: FormData,
): Promise<CriarState> {
  await requireUser();
  const titulo = s(fd.get("titulo"));
  if (!titulo) return { erro: "título obrigatório" };

  const db = getDb();
  const [opcao] = await db
    .insert(scriptNodes)
    .values({ campaignId, titulo, kind: kind(fd.get("kind")) })
    .returning({ id: scriptNodes.id });
  await db
    .insert(scriptGroupOptions)
    .values({ groupId: menuId, nodeId: opcao.id, ordem: await proximaOrdemNoMenu(db, menuId) });

  refresh();
  return { novoId: opcao.id };
}

export async function atualizarOpcao(opcaoId: string, fd: FormData) {
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
      updatedAt: new Date(),
    })
    .where(eq(scriptNodes.id, opcaoId));
  refresh();
}

/** Apaga a opção de vez — some de todos os menus onde aparecia. */
export async function apagarOpcao(opcaoId: string) {
  await requireUser();
  await getDb().delete(scriptNodes).where(eq(scriptNodes.id, opcaoId));
  refresh();
}

/** Tira a opção SÓ deste menu. Ela continua existindo nos outros. */
export async function removerDoMenu(menuId: string, opcaoId: string) {
  await requireUser();
  await getDb()
    .delete(scriptGroupOptions)
    .where(and(eq(scriptGroupOptions.groupId, menuId), eq(scriptGroupOptions.nodeId, opcaoId)));
  refresh();
}

/** Reusa uma opção que já existe neste menu — a MESMA opção, não uma cópia. */
export async function adicionarExistente(menuId: string, opcaoId: string) {
  await requireUser();
  if (!opcaoId) return;
  const db = getDb();
  const [ja] = await db
    .select({ id: scriptGroupOptions.id })
    .from(scriptGroupOptions)
    .where(and(eq(scriptGroupOptions.groupId, menuId), eq(scriptGroupOptions.nodeId, opcaoId)));
  if (ja) return;
  await db
    .insert(scriptGroupOptions)
    .values({ groupId: menuId, nodeId: opcaoId, ordem: await proximaOrdemNoMenu(db, menuId) });
  refresh();
}

/**
 * Destino próprio da opção — a exceção que foge do padrão do menu.
 * null volta a seguir o padrão.
 */
export async function definirDestinoOpcao(opcaoId: string, destinoId: string | null) {
  await requireUser();
  await getDb()
    .update(scriptNodes)
    .set({ proximoId: destinoId, updatedAt: new Date() })
    .where(eq(scriptNodes.id, opcaoId));
  refresh();
}

/** Sobe/desce a opção dentro do menu. A posição é do menu, não da opção. */
export async function moverOpcao(menuId: string, opcaoId: string, dir: -1 | 1) {
  await requireUser();
  const db = getDb();
  const irmas = await db
    .select({ id: scriptGroupOptions.id, nodeId: scriptGroupOptions.nodeId })
    .from(scriptGroupOptions)
    .where(eq(scriptGroupOptions.groupId, menuId))
    .orderBy(scriptGroupOptions.ordem);
  const i = irmas.findIndex((o) => o.nodeId === opcaoId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= irmas.length) return;
  const reordenado = [...irmas];
  [reordenado[i], reordenado[j]] = [reordenado[j], reordenado[i]];
  // reescreve o menu inteiro: ordens duplicadas ou com buraco viram no-op na troca
  await Promise.all(
    reordenado.map((o, idx) => db.update(scriptGroupOptions).set({ ordem: idx }).where(eq(scriptGroupOptions.id, o.id))),
  );
  refresh();
}

export async function duplicarOpcaoAction(menuId: string, opcaoId: string) {
  await requireUser();
  await duplicarOpcao(getDb(), menuId, opcaoId);
  refresh();
}

export async function fundirOpcaoAction(manterId: string, absorvidoId: string) {
  await requireUser();
  await fundirOpcoes(getDb(), manterId, absorvidoId);
  refresh();
}

/** Apaga o fluxo inteiro da carteira (zona de perigo). */
export async function limparFluxo(campaignId: string) {
  await requireUser();
  const db = getDb();
  await db.delete(scriptGroups).where(eq(scriptGroups.campaignId, campaignId));
  await db.delete(scriptNodes).where(eq(scriptNodes.campaignId, campaignId));
  refresh();
}
