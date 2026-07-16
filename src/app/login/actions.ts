"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getClientIp } from "@/auth/client-ip";
import { DUMMY_HASH, verifyPassword } from "@/auth/password";
import { checkLockout, clearFailures, clearRateLimit, rateLimit, registerFailure } from "@/auth/rate-limit";
import { createSession, destroySession } from "@/auth/session";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export type LoginState = { error: string } | undefined;

const RATE_WINDOW_MS = 15 * 60 * 1000;

/** ms → texto curto ("2 min", "45s") pra mensagem de trava. */
function humanWait(ms: number): string {
  const min = Math.ceil(ms / 60000);
  return min >= 1 ? `${min} min` : `${Math.ceil(ms / 1000)}s`;
}

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

  const ip = await getClientIp();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${email}`;

  // 1) lockout progressivo: se IP ou email já estouraram as falhas, barra ANTES
  //    de gastar CPU verificando senha (é o contador "de fato aplicado" do P1)
  const locked = Math.max(checkLockout(ipKey), checkLockout(emailKey));
  if (locked > 0) return { error: `Muitas tentativas. Aguarde ${humanWait(locked)}.` };

  // 2) throttle por janela: teto de tentativas por IP e por email em 15 min
  if (!rateLimit(ipKey, 20, RATE_WINDOW_MS) || !rateLimit(emailKey, 5, RATE_WINDOW_MS)) {
    registerFailure(ipKey);
    registerFailure(emailKey);
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
  if (!ok || !user?.active) {
    // senha errada conta pro lockout de IP e de email
    registerFailure(ipKey);
    registerFailure(emailKey);
    return generic;
  }

  // sucesso: zera throttle E lockout do email (não deixa uma sessão nova travada)
  clearRateLimit(emailKey);
  clearFailures(emailKey);
  clearFailures(ipKey);
  await createSession(user.id);
  redirect(safeNext(fd.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
