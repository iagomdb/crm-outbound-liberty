/**
 * Sessões de banco (revogáveis): o cookie guarda um token opaco de 256 bits e o
 * banco guarda só o sha256 do token — quem vazar o banco não sequestra sessão
 * de ninguém. Sem JWT/segredo: o token não carrega dados, é só uma chave.
 *
 * createSession/destroySession mexem em cookie, então só podem ser chamadas de
 * Server Action ou Route Handler (regra do Next). validateSessionToken é a
 * checagem SEGURA (vai ao banco) usada pelo DAL.
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE } from "./cookie";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, expiração absoluta

export type SessionUser = { id: string; email: string; name: string };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieSecure() {
  // AUTH_COOKIE_SECURE=false libera rodar produção em http puro (ex.: IP na LAN);
  // com https (o normal), deixe sem definir.
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

/** Cria a sessão no banco e grava o cookie httpOnly. */
export async function createSession(userId: string) {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // higiene: aproveita o login pra descartar sessões vencidas de todo mundo
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Retorna o dono do token se a sessão existe, não venceu e o usuário está ativo. */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      active: users.active,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)));

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now() || !row.active) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  return { id: row.userId, email: row.email, name: row.name };
}

/** Apaga a sessão atual (linha no banco + cookie). */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}
