"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess, isAdmin, requireAdmin } from "@/auth/access";
import { hashPassword } from "@/auth/password";
import { createSession, type UserRole } from "@/auth/session";
import { getDb } from "@/db";
import { campaignMembers, campaigns, sessions, users } from "@/db/schema";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function parseEmail(fd: FormData): string {
  const email = s(fd.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("email inválido");
  return email;
}

function parseRole(fd: FormData): UserRole {
  return s(fd.get("role")) === "admin" ? "admin" : "operador";
}

function parsePassword(fd: FormData): string {
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) throw new Error("senha muito curta (mín. 10 caracteres)");
  if (password.length > 200) throw new Error("senha longa demais");
  return password;
}

export async function createUser(fd: FormData) {
  await requireAdmin();
  const name = s(fd.get("name"));
  const email = parseEmail(fd);
  const password = parsePassword(fd);
  if (!name) throw new Error("nome obrigatório");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new Error("já existe usuário com esse email");

  const [u] = await db
    .insert(users)
    .values({ name, email, role: parseRole(fd), passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  revalidatePath("/usuarios");
  // cai na edição: é lá que se libera a carteira pro operador
  redirect(`/usuarios/${u.id}?ok=criado`);
}

export async function updateUser(fd: FormData) {
  await requireAdmin();
  const id = s(fd.get("userId"));
  const name = s(fd.get("name"));
  const email = parseEmail(fd);
  if (!id) throw new Error("usuário inválido");
  if (!name) throw new Error("nome obrigatório");

  const db = getDb();
  // checa colisão antes pra dar erro legível em vez de violação de constraint
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, id)));
  if (clash) throw new Error("já existe outro usuário com esse email");

  const updated = await db.update(users).set({ name, email }).where(eq(users.id, id)).returning({ id: users.id });
  if (updated.length === 0) throw new Error("usuário não encontrado");

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

/** Admin troca a senha de qualquer um; operador, só a própria. */
export async function resetPassword(fd: FormData) {
  const me = await getAccess();
  const id = s(fd.get("userId"));
  if (!isAdmin(me) && id !== me.id) throw new Error("só o admin troca a senha de outro usuário");
  const password = parsePassword(fd);

  const db = getDb();
  const updated = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (updated.length === 0) throw new Error("usuário não encontrado");

  // trocar senha derruba TODAS as sessões do usuário (dispositivo perdido, senha vazada…)
  await db.delete(sessions).where(eq(sessions.userId, id));
  // …mas quem trocou a própria senha continua logado, com sessão nova
  if (id === me.id) await createSession(me.id);

  revalidatePath("/usuarios");
  redirect(`/usuarios/${id}?ok=senha`);
}

export async function toggleActive(fd: FormData) {
  const me = await requireAdmin();
  const id = s(fd.get("userId"));
  if (id === me.id) throw new Error("não dá para desativar o próprio usuário logado");

  const db = getDb();
  const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, id));
  if (!u) throw new Error("usuário não encontrado");

  await db.update(users).set({ active: !u.active }).where(eq(users.id, id));
  // desativar corta o acesso na hora: sessões abertas morrem junto
  if (u.active) await db.delete(sessions).where(eq(sessions.userId, id));

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

/**
 * Papel: admin ⇄ operador. Ninguém mexe no próprio (é como se trancar fora)
 * e o último admin ativo não pode ser rebaixado.
 */
export async function updateRole(fd: FormData) {
  const me = await requireAdmin();
  const id = s(fd.get("userId"));
  const role = parseRole(fd);
  if (id === me.id) throw new Error("não dá para mudar o próprio papel");

  const db = getDb();
  if (role === "operador") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, id)));
    if (n === 0) throw new Error("precisa sobrar pelo menos um admin ativo");
  }

  const updated = await db.update(users).set({ role }).where(eq(users.id, id)).returning({ id: users.id });
  if (updated.length === 0) throw new Error("usuário não encontrado");

  revalidatePath("/usuarios");
  redirect(`/usuarios/${id}?ok=papel`);
}

/**
 * Carteiras que o operador enxerga — o compartilhamento. Substitui a lista
 * inteira pelos checkboxes marcados; vale na próxima request dele.
 */
export async function updateCarteiras(fd: FormData) {
  await requireAdmin();
  const id = s(fd.get("userId"));
  const marcadas = [...new Set(fd.getAll("carteira").filter((v): v is string => typeof v === "string" && v.length > 0))];

  const db = getDb();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!u) throw new Error("usuário não encontrado");
  // só carteira que existe (os ids vêm do browser)
  const validas = marcadas.length
    ? (await db.select({ id: campaigns.id }).from(campaigns)).map((c) => c.id).filter((c) => marcadas.includes(c))
    : [];

  await db.transaction(async (tx) => {
    await tx.delete(campaignMembers).where(eq(campaignMembers.userId, id));
    if (validas.length) {
      await tx.insert(campaignMembers).values(validas.map((campaignId) => ({ campaignId, userId: id })));
    }
  });

  revalidatePath("/", "layout");
  redirect(`/usuarios/${id}?ok=carteiras`);
}
