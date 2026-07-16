"use client";

import { useActionState, useState } from "react";
import type { SendState } from "@/app/targets/[id]/email/actions";

type Template = { id: string; name: string; subject: string; body: string };
type Recipient = { email: string; label: string; contactId: string | null };

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "text-xs font-medium text-zinc-500";

/**
 * Compositor: escolhe o template → assunto/corpo entram editáveis → ajusta pro
 * contexto da conversa → envia. Os templates chegam com {{empresa}}/{{contato}}
 * já substituídos pelo servidor.
 */
export function EmailComposer({
  action,
  templates,
  recipients,
}: {
  action: (prev: SendState, fd: FormData) => Promise<SendState>;
  templates: Template[];
  recipients: Recipient[];
}) {
  const [state, formAction, pending] = useActionState<SendState, FormData>(action, undefined);
  const [subject, setSubject] = useState(templates[0]?.subject ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [to, setTo] = useState(recipients[0]?.email ?? "");

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  const chosen = recipients.find((r) => r.email === to);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {templates.length > 0 ? (
        <div>
          <div className={label}>Template</div>
          <select className={field} defaultValue={templates[0]?.id} onChange={(e) => pickTemplate(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Nenhum template cadastrado — crie em “Templates” no menu (ou escreva do zero abaixo).
        </p>
      )}

      <div>
        <div className={label}>Para</div>
        <input name="to" required list="recipients" value={to} onChange={(e) => setTo(e.target.value)} className={field} placeholder="email@empresa.com.br" />
        <datalist id="recipients">
          {recipients.map((r) => (
            <option key={r.email} value={r.email}>
              {r.label}
            </option>
          ))}
        </datalist>
      </div>
      {/* amarra o envio ao contato certo quando o e-mail é de um contato conhecido */}
      <input type="hidden" name="contactId" value={chosen?.contactId ?? ""} />

      <div>
        <div className={label}>Assunto</div>
        <input name="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
      </div>

      <div>
        <div className={label}>Corpo — ajuste pro contexto da conversa antes de enviar</div>
        <textarea name="body" required rows={16} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Enviando…" : "✉️ Enviar e-mail"}
      </button>
    </form>
  );
}
