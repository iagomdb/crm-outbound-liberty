/**
 * DAL de auth — a linha de defesa REAL (o proxy só pré-filtra pela presença do
 * cookie, sem banco). Toda página e server action protegida chama requireUser()
 * no topo; o cache() do React memoiza por render, então N chamadas = 1 consulta.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./cookie";
import { validateSessionToken, type SessionUser } from "./session";

/** Usuário logado ou null — para lugares onde estar deslogado é aceitável (ex.: /login). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/** Exige login: redireciona para /login se não autenticado. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
});
