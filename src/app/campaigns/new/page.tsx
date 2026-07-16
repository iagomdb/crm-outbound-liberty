import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Script (referência)">
            <Input name="scriptRef" placeholder="docs/cold-call-recuperacao-credito-v2.md" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="ativa">
              <option value="ativa">ativa</option>
              <option value="pausada">pausada</option>
              <option value="arquivada">arquivada</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" className="justify-self-start self-start">
          Criar carteira
        </Button>
      </form>
    </div>
  );
}
