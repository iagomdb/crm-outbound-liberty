"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, companies, targets } from "@/db/schema";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Cria (ou atualiza) uma empresa manualmente e, opcionalmente, cria o alvo na campanha. */
export async function createCompany(fd: FormData) {
  const db = getDb();
  const cnpj = s(fd.get("cnpj")).replace(/\D/g, "");
  const razaoSocial = s(fd.get("razaoSocial"));
  if (!razaoSocial) throw new Error("razão social obrigatória");
  if (cnpj.length !== 14) throw new Error("CNPJ inválido (14 dígitos)");

  const [c] = await db
    .insert(companies)
    .values({
      cnpj,
      razaoSocial,
      nomeFantasia: s(fd.get("nomeFantasia")) || null,
      telefones: [s(fd.get("tel1")), s(fd.get("tel2"))].filter(Boolean),
      emails: [s(fd.get("email1")), s(fd.get("email2"))].filter(Boolean),
      cnaePrincipal: s(fd.get("cnaePrincipal")) || null,
      porte: s(fd.get("porte")) || null,
      uf: s(fd.get("uf")).slice(0, 2) || null,
      municipio: s(fd.get("municipio")) || null,
      source: "manual",
    })
    .onConflictDoUpdate({ target: companies.cnpj, set: { razaoSocial, updatedAt: new Date() } })
    .returning({ id: companies.id });

  let redirectTo = "/";
  const campaignSlug = s(fd.get("campaignSlug"));
  if (campaignSlug) {
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.slug, campaignSlug));
    if (camp) {
      await db
        .insert(targets)
        .values({ campaignId: camp.id, companyId: c.id })
        .onConflictDoNothing({ target: [targets.campaignId, targets.companyId] });
      const [tg] = await db
        .select({ id: targets.id })
        .from(targets)
        .where(and(eq(targets.campaignId, camp.id), eq(targets.companyId, c.id)));
      redirectTo = tg ? `/targets/${tg.id}` : `/campaigns/${campaignSlug}`;
    }
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}
