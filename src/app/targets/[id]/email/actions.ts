"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { sendTargetEmail } from "@/email/send";

export type SendState = { error: string } | undefined;

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function sendEmail(targetId: string, back: string, _prev: SendState, fd: FormData): Promise<SendState> {
  await requireUser();

  const to = s(fd.get("to"));
  const subject = s(fd.get("subject"));
  const body = s(fd.get("body"));
  const contactId = s(fd.get("contactId")) || null;

  if (!to.includes("@")) return { error: "Destinatário inválido." };
  if (!subject) return { error: "Assunto vazio." };
  if (!body) return { error: "Corpo vazio." };

  try {
    await sendTargetEmail(getDb(), { targetId, contactId, to, subject, body });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao enviar." };
  }

  revalidatePath("/", "layout");
  redirect(back === "fila" ? `/fila/${targetId}` : `/targets/${targetId}`);
}
