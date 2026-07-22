import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { createCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <Link href="/" className="text-xs text-zinc-400 hover:underline">
          ← campanhas
        </Link>
        <h1 className="text-xl font-semibold">Nova carteira</h1>
        <p className="text-sm text-zinc-500">
          Uma carteira é uma campanha: oferta + ICP + o funil dela. As empresas entram depois, via importação ou
          cadastro manual.
        </p>
      </div>

      <form action={createCampaign} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field label="Nome *">
          <Input name="name" required placeholder="ex.: Recuperação de Crédito — RS" />
        </Field>
        <Field label="Descrição">
          <Textarea name="description" rows={2} placeholder="o que essa carteira persegue" />
        </Field>
        <Field label="Condições da oferta (travadas)">
          <Textarea
            name="offerTerms"
            rows={2}
            placeholder='ex.: honorário de êxito ("só paga se recuperar"); caso único; escritório tria'
          />
        </Field>
        <Field label="ICP">
          <Textarea
            name="icp"
            rows={2}
            placeholder="ex.: indústria/distribuidora média, B2B, sem jurídico interno dono do contas a receber"
          />
        </Field>
        {/* pitch e checklist lado a lado — são editados juntos */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Script / pitch da carteira (markdown)"
            hint="aba 📜 na tela de discagem, renderizado"
          >
            <Textarea
              name="script"
              rows={18}
              className="font-mono text-xs"
              placeholder={"# Playbook de Ligação\n\n## 1. Abertura\n> Boa tarde! ...\n\n- **negrito** pros ganchos\n- listas, títulos e citações são renderizados"}
            />
          </Field>
          <Field label="Checklist da ligação" hint="aba ✅ na tela de discagem — objetivos marcáveis, na ordem daqui">
            <ChecklistEditor initialItems={[]} />
          </Field>
        </div>
        <Field label="Status" className="max-w-48">
          <Select name="status" defaultValue="ativa">
            <option value="ativa">ativa</option>
            <option value="pausada">pausada</option>
            <option value="arquivada">arquivada</option>
          </Select>
        </Field>
        <Button type="submit" className="justify-self-start self-start">
          Criar carteira
        </Button>
      </form>
    </div>
  );
}
