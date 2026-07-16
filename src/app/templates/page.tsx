import { requireUser } from "@/auth/dal";
import { getEmailTemplates } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { createTemplate, deleteTemplate, updateTemplate } from "./actions";

export const dynamic = "force-dynamic";

function TemplateFields({ defaults }: { defaults?: { name: string; subject: string; body: string } }) {
  return (
    <>
      <Field label="Nome interno">
        <Input name="name" required defaultValue={defaults?.name} placeholder="ex: Follow-up pós-ligação" />
      </Field>
      <Field label="Assunto">
        <Input name="subject" required defaultValue={defaults?.subject} />
      </Field>
      <Field
        label="Corpo (texto puro)"
        hint={
          <>
            {"{{empresa}}"} e {"{{contato}}"} são substituídos pelos dados do lead na hora de compor.
          </>
        }
      >
        <Textarea name="body" required rows={12} defaultValue={defaults?.body} />
      </Field>
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

      <Card title="Novo template">
        <form action={createTemplate} className="flex flex-col gap-3">
          <TemplateFields />
          <Button type="submit" className="self-start">Criar template</Button>
        </form>
      </Card>

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
                  <Button type="submit" className="self-start">Salvar</Button>
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
