"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { hashPassword } from "@/auth/password";
import { createSession } from "@/auth/session";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function parseEmail(fd: FormData): string {
  const email = s(fd.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("email inválido");
  return email;
}

function parsePassword(fd: FormData): string {
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) throw new Error("senha muito curta (mín. 10 caracteres)");
  if (password.length > 200) throw new Error("senha longa demais");
  return password;
}

export async function createUser(fd: FormData) {
  await requireUser();
  const name = s(fd.get("name"));
  const email = parseEmail(fd);
  const password = parsePassword(fd);
  if (!name) throw new Error("nome obrigatório");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new Error("já existe usuário com esse email");

  await db.insert(users).values({ name, email, passwordHash: await hashPassword(password) });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function updateUser(fd: FormData) {
  await requireUser();
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

export async function resetPassword(fd: FormData) {
  const me = await requireUser();
  const id = s(fd.get("userId"));
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
  const me = await requireUser();
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
