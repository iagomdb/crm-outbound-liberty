import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getEmailTemplates, getTargetDetail } from "@/db/queries";
import { EmailComposer } from "@/components/EmailComposer";
import { fillTemplate } from "@/email/send";
import { isEmailConfigured } from "@/email/mailer";
import { ROLE_LABELS } from "@/core/pipeline";
import { sendEmail } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  await requireUser();
  const [{ id }, { back }] = await Promise.all([params, searchParams]);
  const [t, rawTemplates] = await Promise.all([getTargetDetail(id), getEmailTemplates()]);
  if (!t) notFound();

  const co = t.company;
  const empresa = co.nomeFantasia || co.razaoSocial;
  const contato = t.primaryContact?.nome || co.contacts.find((c) => c.nome)?.nome || "";

  const templates = rawTemplates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    subject: fillTemplate(tpl.subject, { empresa, contato }),
    body: fillTemplate(tpl.body, { empresa, contato }),
  }));

  // destinatários sugeridos: e-mail dos contatos primeiro (nominal), depois os da empresa
  const recipients = [
    ...co.contacts
      .filter((c) => c.email)
      .map((c) => ({ email: c.email!, label: `${c.nome || "sem nome"} (${ROLE_LABELS[c.papel]})`, contactId: c.id })),
    ...(co.emails ?? []).map((e) => ({ email: e, label: "e-mail da empresa", contactId: null as string | null })),
  ].filter((r, i, arr) => arr.findIndex((x) => x.email === r.email) === i);

  const backHref = back === "fila" ? `/fila/${t.id}` : `/targets/${t.id}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <Link href={backHref} className="text-xs text-zinc-400 hover:underline">
          ← {empresa}
        </Link>
        <h1 className="text-xl font-semibold">Enviar e-mail</h1>
        <p className="text-sm text-zinc-500">
          O envio fica registrado no histórico do lead (tipo “email”) — não conta discada nem mexe na cadência.
        </p>
      </div>

      {!isEmailConfigured() && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          SMTP não configurado — preencha <code>SMTP_HOST</code>, <code>SMTP_FROM</code> (e usuário/senha se houver) no{" "}
          <code>.env</code> e reinicie o container. Dá pra compor mesmo assim, mas o envio vai falhar.
        </p>
      )}

      {recipients.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Nenhum e-mail conhecido pra esse lead — digite o destinatário à mão (e aproveite pra cadastrar no contato
          depois).
        </p>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <EmailComposer action={sendEmail.bind(null, t.id, back ?? "")} templates={templates} recipients={recipients} />
      </section>
    </div>
  );
}
