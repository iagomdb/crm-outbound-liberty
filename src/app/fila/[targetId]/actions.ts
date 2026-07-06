"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { recordCall } from "@/core/log-call";
import { parseCallForm } from "@/lib/call-form";
import { getNextInQueue } from "@/db/queries";

/**
 * Modo discagem: registra a ligação (regra de ouro gera a próxima task) e
 * pula direto pra próxima da fila — zero cliques entre ligações.
 */
export async function logCallAndNext(targetId: string, formData: FormData) {
  await recordCall(getDb(), targetId, parseCallForm(formData));

  const nextId = await getNextInQueue(targetId);
  revalidatePath("/", "layout");
  redirect(nextId ? `/fila/${nextId}` : "/fila");
}
