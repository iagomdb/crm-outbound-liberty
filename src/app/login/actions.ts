"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DUMMY_HASH, verifyPassword } from "@/auth/password";
import { clearRateLimit, rateLimit } from "@/auth/rate-limit";
import { createSession, destroySession } from "@/auth/session";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export type LoginState = { error: string } | undefined;

const RATE_WINDOW_MS = 15 * 60 * 1000;

/** Só aceita caminho local ("/..." mas não "//...") — evita open redirect via ?next=. */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export async function login(_prev: LoginState, fd: FormData): Promise<LoginState> {
  // erro genérico sempre: não confirmar se o que errou foi o email ou a senha
  const generic = { error: "Email ou senha inválidos." };

  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password || password.length > 200) return generic;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const emailKey = `login:email:${email}`;
  if (!rateLimit(`login:ip:${ip}`, 20, RATE_WINDOW_MS) || !rateLimit(emailKey, 5, RATE_WINDOW_MS)) {
    return { error: "Muitas tentativas. Aguarde 15 minutos." };
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, active: users.active })
    .from(users)
    .where(eq(users.email, email));

  // email inexistente ou usuário inativo verificam contra o DUMMY_HASH mesmo
  // assim, pra resposta demorar o mesmo tempo e não entregar quem existe
  const ok = await verifyPassword(password, user?.active ? user.passwordHash : DUMMY_HASH);
  if (!ok || !user?.active) return generic;

  clearRateLimit(emailKey);
  await createSession(user.id);
  redirect(safeNext(fd.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
