/**
 * Envio de e-mail pra um alvo + registro no histórico (activities, type "email").
 * NÃO mexe em estágio/tentativas/task: e-mail não é discada — a cadência de
 * ligação continua mandando. Função pura (recebe o db), como core/log-call.ts.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { emailConfig, getTransporter } from "./mailer";

type DB = PostgresJsDatabase<typeof schema>;

export type SendEmailInput = {
  targetId: string;
  contactId: string | null;
  to: string;
  subject: string;
  body: string;
};

export async function sendTargetEmail(db: DB, input: SendEmailInput) {
  const cfg = emailConfig();
  if (!cfg) throw new Error("SMTP não configurado — preencha SMTP_HOST e SMTP_FROM no .env");

  await getTransporter().sendMail({
    from: cfg.from,
    to: input.to,
    subject: input.subject,
    text: input.body,
  });

  const now = new Date();
  const [act] = await db
    .insert(schema.activities)
    .values({
      targetId: input.targetId,
      contactId: input.contactId,
      type: "email",
      occurredAt: now,
      reachedHuman: false,
      outcome: `e-mail enviado para ${input.to} — “${input.subject}”`,
      notes: input.body,
    })
    .returning({ id: schema.activities.id });

  await db.update(schema.targets).set({ updatedAt: now }).where(eq(schema.targets.id, input.targetId));

  return { activityId: act.id };
}

/** Substitui os placeholders dos templates ({{empresa}}, {{contato}}). */
export function fillTemplate(text: string, vars: { empresa: string; contato: string }) {
  return text.replaceAll("{{empresa}}", vars.empresa).replaceAll("{{contato}}", vars.contato);
}
