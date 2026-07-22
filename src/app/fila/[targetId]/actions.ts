"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { recordCall } from "@/core/log-call";
import { parseCallForm } from "@/lib/call-form";
import { getNextInQueue, getRandomRoletaTarget } from "@/db/queries";

/**
 * Modo discagem: registra a ligação (regra de ouro gera a próxima task) e
 * pula direto pra próxima — da fila, ou sorteada (modo roleta) quando a
 * sessão veio de /roleta com carteiras selecionadas.
 */
export async function logCallAndNext(targetId: string, roletaSlugs: string[] | null, formData: FormData) {
  await requireUser();
  await recordCall(getDb(), targetId, parseCallForm(formData));
  revalidatePath("/", "layout");

  if (roletaSlugs?.length) {
    const nextId = await getRandomRoletaTarget(roletaSlugs, targetId);
    if (!nextId) redirect(`/roleta?err=${encodeURIComponent("acabaram as empresas disponíveis nessas carteiras")}`);
    redirect(`/fila/${nextId}?roleta=${encodeURIComponent(roletaSlugs.join(","))}`);
  }

  const nextId = await getNextInQueue(targetId);
  redirect(nextId ? `/fila/${nextId}` : "/fila");
}
