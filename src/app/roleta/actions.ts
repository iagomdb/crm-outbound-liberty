"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getRandomRoletaTarget } from "@/db/queries";

/** Sorteia a primeira empresa dentro das carteiras marcadas e abre a tela de discagem em modo roleta. */
export async function sortear(fd: FormData) {
  await requireUser();
  const slugs = fd.getAll("c").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!slugs.length) redirect(`/roleta?err=${encodeURIComponent("marque pelo menos uma carteira")}`);

  const id = await getRandomRoletaTarget(slugs);
  if (!id) redirect(`/roleta?err=${encodeURIComponent("nenhuma empresa em “novo”/“fit” nas carteiras marcadas")}`);

  redirect(`/fila/${id}?roleta=${encodeURIComponent(slugs.join(","))}`);
}

/** “Pular” no modo roleta: sorteia outra empresa das mesmas carteiras, sem repetir a atual. */
export async function sortearProxima(slugs: string[], skipId: string) {
  await requireUser();
  const id = await getRandomRoletaTarget(slugs, skipId);
  if (!id) redirect(`/roleta?err=${encodeURIComponent("acabaram as empresas disponíveis nessas carteiras")}`);
  redirect(`/fila/${id}?roleta=${encodeURIComponent(slugs.join(","))}`);
}
