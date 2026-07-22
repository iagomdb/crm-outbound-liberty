"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { copyPlaybook } from "@/core/checklist";

/** Duplica a hipótese (pitch + checklist) da carteira de origem pra escolhida no select. */
export async function duplicarHipotese(fromCampaignId: string, fd: FormData) {
  await requireUser();
  const toCampaignId = typeof fd.get("toCampaignId") === "string" ? (fd.get("toCampaignId") as string) : "";
  if (!toCampaignId) redirect(`/hipoteses?err=${encodeURIComponent("escolha a carteira de destino")}`);
  if (toCampaignId === fromCampaignId) redirect(`/hipoteses?err=${encodeURIComponent("origem e destino são a mesma carteira")}`);

  await copyPlaybook(getDb(), fromCampaignId, toCampaignId);

  revalidatePath("/", "layout");
  redirect(`/hipoteses?ok=1`);
}
