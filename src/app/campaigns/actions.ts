"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, like } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { slugify } from "@/lib/slugify";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

type CampaignStatus = typeof campaigns.$inferInsert.status;

/** Cria uma carteira (campanha) nova e leva direto pro board dela. */
export async function createCampaign(fd: FormData) {
  await requireUser();
  const db = getDb();
  const name = s(fd.get("name"));
  if (!name) throw new Error("nome obrigatório");

  const base = slugify(name) || "carteira";
  const taken = new Set(
    (await db.select({ slug: campaigns.slug }).from(campaigns).where(like(campaigns.slug, `${base}%`))).map(
      (r) => r.slug,
    ),
  );
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  await db.insert(campaigns).values({
    name,
    slug,
    description: s(fd.get("description")) || null,
    offerTerms: s(fd.get("offerTerms")) || null,
    icp: s(fd.get("icp")) || null,
    script: s(fd.get("script")) || null,
    checklist: s(fd.get("checklist")) || null,
    status: (s(fd.get("status")) || "ativa") as CampaignStatus,
  });

  revalidatePath("/", "layout");
  redirect(`/campaigns/${slug}`);
}

/** Atualiza a carteira. O slug não muda (URLs e histórico continuam válidos). */
export async function updateCampaign(campaignId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  const name = s(fd.get("name"));
  if (!name) throw new Error("nome obrigatório");

  const [c] = await db
    .update(campaigns)
    .set({
      name,
      description: s(fd.get("description")) || null,
      offerTerms: s(fd.get("offerTerms")) || null,
      icp: s(fd.get("icp")) || null,
      script: s(fd.get("script")) || null,
      checklist: s(fd.get("checklist")) || null,
      status: (s(fd.get("status")) || "ativa") as CampaignStatus,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId))
    .returning({ slug: campaigns.slug });

  revalidatePath("/", "layout");
  redirect(`/campaigns/${c.slug}`);
}

/** Apaga a carteira e, em cascata, alvos/ligações/reuniões dela. Empresas (globais) ficam. */
export async function deleteCampaign(campaignId: string) {
  await requireUser();
  const db = getDb();
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  revalidatePath("/", "layout");
  redirect("/");
}
