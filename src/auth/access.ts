/**
 * AUTORIZAÇÃO — o que cada usuário alcança. O DAL (dal.ts) responde QUEM é;
 * aqui se decide O QUE ele vê e mexe:
 *
 *   admin    → o CRM inteiro (campaignIds = null)
 *   operador → só as carteiras liberadas pra ele em campaign_members
 *
 * Toda server action que recebe um id do browser passa por um assert* antes de
 * tocar no banco: action é endpoint POST público e o id é input do cliente —
 * esconder o botão na tela não protege nada. Páginas usam as variantes que
 * dão 404 (não vazam nem que o registro existe).
 *
 * O escopo é lido do banco a cada request (cache() memoiza só dentro dela),
 * então tirar uma carteira de alguém corta o acesso na hora, sem relogar.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { activities, campaignMembers, contacts, scriptGroups, scriptNodes, targets } from "@/db/schema";
import { getCampaignBySlug, type Escopo } from "@/db/queries";
import { getContaAtiva } from "@/lib/conta-server";
import { requireUser } from "./dal";
import type { SessionUser } from "./session";

export type Access = SessionUser & {
  /** carteiras que pode ver; null = todas (admin) */
  campaignIds: string[] | null;
};

export const isAdmin = (u: { role: string }) => u.role === "admin";

export const podeVerCarteira = (a: Access, campaignId: string) =>
  a.campaignIds === null || a.campaignIds.includes(campaignId);

/** Usuário logado + carteiras que ele alcança. Sem sessão → /login. */
export const getAccess = cache(async (): Promise<Access> => {
  const user = await requireUser();
  if (isAdmin(user)) return { ...user, campaignIds: null };
  const rows = await getDb()
    .select({ id: campaignMembers.campaignId })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, user.id));
  return { ...user, campaignIds: rows.map((r) => r.id) };
});

/**
 * Recorte das listagens: a conta escolhida no topo (filtro de VISÃO, cookie)
 * somada às carteiras que o usuário PODE ver (permissão).
 */
export const getEscopo = cache(async (): Promise<Escopo> => {
  const [access, conta] = await Promise.all([getAccess(), getContaAtiva()]);
  return { conta, campaignIds: access.campaignIds };
});

function negar(): never {
  throw new Error("sem acesso a esse registro");
}

// ---------------------------------------------------------------- páginas (404)

/** Página só de admin: pro operador ela não existe. */
export async function requireAdminPage(): Promise<Access> {
  const a = await getAccess();
  if (!isAdmin(a)) notFound();
  return a;
}

/** Carteira pelo slug, se o usuário pode vê-la — senão 404. */
export async function getCarteiraOu404(slug: string) {
  const [a, c] = await Promise.all([getAccess(), getCampaignBySlug(slug)]);
  if (!c || !podeVerCarteira(a, c.id)) notFound();
  return c;
}

// ---------------------------------------------------------------- server actions (erro)

/** Action só de admin. */
export async function requireAdmin(): Promise<Access> {
  const a = await getAccess();
  if (!isAdmin(a)) throw new Error("só o admin pode fazer isso");
  return a;
}

export async function assertCarteira(campaignId: string): Promise<Access> {
  const a = await getAccess();
  if (!podeVerCarteira(a, campaignId)) negar();
  return a;
}

/** Carteira pelo slug (actions que recebem o slug do browser). */
export async function assertCarteiraSlug(slug: string) {
  const [a, c] = await Promise.all([getAccess(), getCampaignBySlug(slug)]);
  if (!c || !podeVerCarteira(a, c.id)) negar();
  return c;
}

/** Alvo: acesso pela carteira dele. Devolve o alvo mínimo junto. */
export async function assertTarget(targetId: string) {
  const a = await getAccess();
  const [t] = await getDb()
    .select({ id: targets.id, campaignId: targets.campaignId, companyId: targets.companyId })
    .from(targets)
    .where(eq(targets.id, targetId));
  if (!t || !podeVerCarteira(a, t.campaignId)) negar();
  return { access: a, target: t };
}

/**
 * Empresa é GLOBAL (uma por CNPJ, várias carteiras): o operador alcança a
 * empresa se ela tem alvo em alguma carteira dele.
 */
export async function assertCompany(companyId: string): Promise<Access> {
  const a = await getAccess();
  if (a.campaignIds === null) return a;
  const [hit] = await getDb()
    .select({ id: targets.id })
    .from(targets)
    .where(and(eq(targets.companyId, companyId), inArray(targets.campaignId, a.campaignIds)))
    .limit(1);
  if (!hit) negar();
  return a;
}

export async function assertContact(contactId: string): Promise<Access> {
  const [c] = await getDb().select({ companyId: contacts.companyId }).from(contacts).where(eq(contacts.id, contactId));
  if (!c) negar();
  return assertCompany(c.companyId);
}

/** Ligação: acesso pela carteira do alvo. Devolve o autor (regra de "apagar só a sua"). */
export async function assertActivity(activityId: string) {
  const a = await getAccess();
  const [row] = await getDb()
    .select({ autorId: activities.userId, campaignId: targets.campaignId })
    .from(activities)
    .innerJoin(targets, eq(activities.targetId, targets.id))
    .where(eq(activities.id, activityId));
  if (!row || !podeVerCarteira(a, row.campaignId)) negar();
  return { access: a, autorId: row.autorId };
}

/**
 * Fluxo: menus e opções citados numa action precisam ser TODOS da mesma
 * carteira — e ela, acessível. Sem isso dava pra apontar um menu da sua
 * carteira pra um da carteira alheia, ou fundir opções entre carteiras.
 * Devolve o id da carteira.
 */
export async function assertFluxo(ref: {
  campaignId?: string;
  menuIds?: (string | null | undefined)[];
  opcaoIds?: (string | null | undefined)[];
}): Promise<string> {
  const db = getDb();
  const menuIds = [...new Set((ref.menuIds ?? []).filter((x): x is string => Boolean(x)))];
  const opcaoIds = [...new Set((ref.opcaoIds ?? []).filter((x): x is string => Boolean(x)))];
  const donos = new Set<string>(ref.campaignId ? [ref.campaignId] : []);

  if (menuIds.length) {
    const rows = await db
      .select({ c: scriptGroups.campaignId })
      .from(scriptGroups)
      .where(inArray(scriptGroups.id, menuIds));
    if (rows.length !== menuIds.length) negar();
    for (const r of rows) donos.add(r.c);
  }
  if (opcaoIds.length) {
    const rows = await db
      .select({ c: scriptNodes.campaignId })
      .from(scriptNodes)
      .where(inArray(scriptNodes.id, opcaoIds));
    if (rows.length !== opcaoIds.length) negar();
    for (const r of rows) donos.add(r.c);
  }

  if (donos.size !== 1) negar();
  const [campaignId] = donos;
  await assertCarteira(campaignId);
  return campaignId;
}
