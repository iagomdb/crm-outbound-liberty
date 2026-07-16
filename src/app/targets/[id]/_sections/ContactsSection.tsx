import { Card, Input, Select, Button, fieldClasses } from "@/components/ui";
import { MaskedInput } from "@/components/MaskedInput";
import { createContact, deleteContact, updateContact } from "../crud-actions";
import type { TargetDetail } from "@/db/queries";
import { ROLE_LABELS } from "@/core/pipeline";
import { contactRole } from "@/db/schema";
import { fmtPhone } from "@/lib/format";

type ContactRow = TargetDetail["company"]["contacts"][number];

const summaryClasses = "cursor-pointer text-xs text-sky-600 hover:underline dark:text-sky-400";

function ContactFields({ c }: { c?: ContactRow }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input name="nome" defaultValue={c?.nome ?? ""} placeholder="nome" />
      <Select name="papel" defaultValue={c?.papel ?? "desconhecido"}>
        {contactRole.enumValues.map((v) => (
          <option key={v} value={v}>
            {ROLE_LABELS[v] ?? v}
          </option>
        ))}
      </Select>
      <Input name="cargo" defaultValue={c?.cargo ?? ""} placeholder="cargo" />
      <MaskedInput mask="phone" name="telefoneDireto" defaultValue={c?.telefoneDireto ?? ""} placeholder="telefone direto" className={fieldClasses} />
      <Input name="email" defaultValue={c?.email ?? ""} placeholder="e-mail" />
      <Input name="melhorHorario" defaultValue={c?.melhorHorario ?? ""} placeholder="melhor horário" />
      <label className="col-span-2 flex items-center gap-1.5 text-xs">
        <input type="checkbox" name="emailGenerico" defaultChecked={c?.emailGenerico} className="h-4 w-4" /> e-mail genérico
        (financeiro@ = buraco negro)
      </label>
    </div>
  );
}

export function ContactsSection({ companyId, contacts }: { companyId: string; contacts: ContactRow[] }) {
  return (
    <Card title={`Contatos (${contacts.length})`}>
      {contacts.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum contato. O gatekeeper existe pra achar o decisor.</p>
      )}
      <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 py-2 first:pt-0">
            <div className="flex items-center justify-between text-sm">
              <span>
                <strong className="font-medium">{c.nome || "sem nome"}</strong>{" "}
                <span className="text-xs text-zinc-400">{ROLE_LABELS[c.papel] ?? c.papel}</span>
                {c.emailGenerico && <span className="ml-1 text-xs text-orange-500">(genérico)</span>}
              </span>
              <span className="text-zinc-500">{fmtPhone(c.telefoneDireto) || c.email || "—"}</span>
            </div>
            <div className="flex gap-3">
              <details>
                <summary className={summaryClasses}>editar</summary>
                <form action={updateContact.bind(null, c.id)} className="mt-2 flex flex-col gap-2">
                  <ContactFields c={c} />
                  <Button type="submit" className="self-start">
                    Salvar
                  </Button>
                </form>
              </details>
              <form action={deleteContact.bind(null, c.id)}>
                <button className="text-xs text-red-500 hover:underline">remover</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className={summaryClasses}>+ adicionar contato</summary>
        <form action={createContact.bind(null, companyId)} className="mt-2 flex flex-col gap-2">
          <ContactFields />
          <Button type="submit" className="self-start">
            Adicionar
          </Button>
        </form>
      </details>
    </Card>
  );
}
