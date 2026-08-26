"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth/dal";
import { CONTA_COOKIE } from "@/lib/conta";

const UM_ANO = 60 * 60 * 24 * 365;

/** Troca a conta ativa (vazio = todas as contas). Recarrega o app inteiro. */
export async function trocarConta(fd: FormData) {
  await requireUser();
  const raw = fd.get("conta");
  const conta = typeof raw === "string" ? raw.trim() : "";
  const jar = await cookies();
  if (conta) {
    jar.set(CONTA_COOKIE, conta, { path: "/", httpOnly: true, sameSite: "lax", maxAge: UM_ANO });
  } else {
    jar.delete(CONTA_COOKIE);
  }
  revalidatePath("/", "layout");
}
