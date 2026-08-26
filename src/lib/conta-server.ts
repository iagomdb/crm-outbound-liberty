/** Leitura da conta ativa (server-only — usa next/headers). Ver lib/conta.ts. */
import { cookies } from "next/headers";
import { CONTA_COOKIE } from "./conta";

/** Conta ativa, ou null (= todas as contas). */
export async function getContaAtiva(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(CONTA_COOKIE)?.value?.trim();
  return v ? v : null;
}
