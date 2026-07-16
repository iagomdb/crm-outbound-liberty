import { requireUser } from "@/auth/dal";
import { getEmailTemplates } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createTemplate, deleteTemplate, updateTemplate } from "./actions";

export const dynamic = "force-dynamic";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "text-xs font-medium text-zinc-500";
const saveBtn =
  "self-start rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

function TemplateFields({ defaults }: { defaults?: { name: string; subject: string; body: string } }) {
  return (
    <>
      <div>
        <div className={label}>Nome interno</div>
        <input name="name" required defaultValue={defaults?.name} className={field} placeholder="ex: Follow-up pós-ligação" />
      </div>
      <div>
        <div className={label}>Assunto</div>
        <input name="subject" required defaultValue={defaults?.subject} className={field} />
      </div>
      <div>
        <div className={label}>Corpo (texto puro)</div>
        <textarea name="body" required rows={12} defaultValue={defaults?.body} className={field} />
        <p className="mt-0.5 text-[10px] text-zinc-400">
          {"{{empresa}}"} e {"{{contato}}"} são substituídos pelos dados do lead na hora de compor.
        </p>
      </div>
    </>
  );
}

/** CRUD de templates de e-mail — usados no “✉️ e-mail” da tela da task. */
export default async function TemplatesPage() {
  await requireUser();
  const templates = await getEmailTemplates();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Templates de e-mail</h1>
        <p className="text-sm text-zinc-500">
          {templates.length} template(s). A lista aparece ao enviar e-mail de qualquer lead — o texto é editável antes
          de cada envio.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold">Novo template</h2>
        <form action={createTemplate} className="flex flex-col gap-3">
          <TemplateFields />
          <button className={saveBtn}>Criar template</button>
        </form>
      </section>

      {templates.map((t) => (
        <section key={t.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <details>
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900">
              {t.name} <span className="ml-2 font-normal text-zinc-400">“{t.subject}”</span>
            </summary>
            <div className="border-t border-zinc-100 p-5 dark:border-zinc-900">
              <form action={updateTemplate.bind(null, t.id)} className="flex flex-col gap-3">
                <TemplateFields defaults={t} />
                <div className="flex items-center gap-2">
                  <button className={saveBtn}>Salvar</button>
                </div>
              </form>
              <form action={deleteTemplate.bind(null, t.id)} className="mt-2">
                <ConfirmButton
                  message={`Excluir o template "${t.name}"?`}
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-red-500"
                >
                  excluir template
                </ConfirmButton>
              </form>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
