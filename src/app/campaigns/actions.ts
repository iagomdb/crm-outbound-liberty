"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, like } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { campaigns, checklistItems } from "@/db/schema";
import { slugify } from "@/lib/slugify";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

type CampaignStatus = typeof campaigns.$inferInsert.status;

// O editor manda os itens do checklist serializados num hidden input.
const checklistSchema = z.array(
  z.object({ titulo: z.string().trim().min(1), descricao: z.string().trim().optional() }),
);

/** Substitui (replace-all) os itens do checklist da carteira, preservando a ordem do editor. */
async function replaceChecklistItems(db: ReturnType<typeof getDb>, campaignId: string, raw: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw || "[]");
  } catch {
    throw new Error("checklist inválido");
  }
  const parsed = checklistSchema.safeParse(json);
  if (!parsed.success) throw new Error("checklist inválido");

  await db.delete(checklistItems).where(eq(checklistItems.campaignId, campaignId));
  if (parsed.data.length) {
    await db.insert(checklistItems).values(
      parsed.data.map((item, idx) => ({
        campaignId,
        titulo: item.titulo,
        descricao: item.descricao || null,
        ordem: idx,
      })),
    );
  }
}

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

  const [created] = await db
    .insert(campaigns)
    .values({
      name,
      slug,
      description: s(fd.get("description")) || null,
      offerTerms: s(fd.get("offerTerms")) || null,
      icp: s(fd.get("icp")) || null,
      script: s(fd.get("script")) || null,
      status: (s(fd.get("status")) || "ativa") as CampaignStatus,
    })
    .returning({ id: campaigns.id });

  await replaceChecklistItems(db, created.id, s(fd.get("checklistItems")));

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
      status: (s(fd.get("status")) || "ativa") as CampaignStatus,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId))
    .returning({ slug: campaigns.slug });

  await replaceChecklistItems(db, campaignId, s(fd.get("checklistItems")));

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
