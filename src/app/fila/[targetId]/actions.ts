"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertTarget, getEscopo } from "@/auth/access";
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
  const { access } = await assertTarget(targetId);
  const escopo = await getEscopo();

  // a próxima sai da fila ANTES do registro: depois de gravar, este alvo já
  // ganhou task futura e sumiu da fila — sem posição, o cursor cairia no topo
  // (o ping-pong que a gente acabou de matar).
  const nextId = roletaSlugs?.length ? null : await getNextInQueue(targetId, escopo);

  await recordCall(getDb(), targetId, parseCallForm(formData), access.id);
  revalidatePath("/", "layout");

  if (roletaSlugs?.length) {
    const sorteado = await getRandomRoletaTarget(roletaSlugs, access.campaignIds, targetId);
    if (!sorteado) redirect(`/roleta?err=${encodeURIComponent("acabaram as empresas disponíveis nessas carteiras")}`);
    redirect(`/fila/${sorteado}?roleta=${encodeURIComponent(roletaSlugs.join(","))}`);
  }

  redirect(nextId ? `/fila/${nextId}` : "/fila");
}
