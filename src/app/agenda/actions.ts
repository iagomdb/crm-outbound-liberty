"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { targets } from "@/db/schema";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Agenda um retorno num lead: data + pretexto novo (a "task"). */
export async function scheduleReturn(targetId: string, fd: FormData) {
  await requireUser();
  const db = getDb();
  const due = s(fd.get("dueAt"));
  await db
    .update(targets)
    .set({
      nextActionAt: due ? new Date(due) : null,
      nextActionPretext: s(fd.get("pretext")) || null,
      updatedAt: new Date(),
    })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

/** Retorno feito: limpa o agendamento. */
export async function completeReturn(targetId: string) {
  await requireUser();
  const db = getDb();
  await db
    .update(targets)
    .set({ nextActionAt: null, nextActionPretext: null, updatedAt: new Date() })
    .where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}

/** Empurra o retorno N dias (a partir da data atual dele, ou de agora se já passou). */
export async function snoozeReturn(targetId: string, days: number) {
  await requireUser();
  const db = getDb();
  const [t] = await db.select({ nextActionAt: targets.nextActionAt }).from(targets).where(eq(targets.id, targetId));
  const now = new Date();
  const base = t?.nextActionAt && t.nextActionAt > now ? t.nextActionAt : now;
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  await db.update(targets).set({ nextActionAt: next, updatedAt: new Date() }).where(eq(targets.id, targetId));
  revalidatePath("/", "layout");
}
