"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/auth/access";
import { getDb } from "@/db";
import { emailTemplates } from "@/db/schema";

// templates são globais (todas as carteiras usam): só admin edita
const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createTemplate(fd: FormData) {
  await requireAdmin();
  const name = s(fd.get("name"));
  const subject = s(fd.get("subject"));
  const body = s(fd.get("body"));
  if (!name || !subject || !body) return;
  await getDb().insert(emailTemplates).values({ name, subject, body });
  revalidatePath("/templates");
}

export async function updateTemplate(id: string, fd: FormData) {
  await requireAdmin();
  const name = s(fd.get("name"));
  const subject = s(fd.get("subject"));
  const body = s(fd.get("body"));
  if (!name || !subject || !body) return;
  await getDb()
    .update(emailTemplates)
    .set({ name, subject, body, updatedAt: new Date() })
    .where(eq(emailTemplates.id, id));
  revalidatePath("/templates");
}

export async function deleteTemplate(id: string) {
  await requireAdmin();
  await getDb().delete(emailTemplates).where(eq(emailTemplates.id, id));
  revalidatePath("/templates");
}
