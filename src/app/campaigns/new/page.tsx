import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { createCampaign } from "../actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";

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
        <div>
          <div className={lbl}>Nome *</div>
          <input name="name" required placeholder="ex.: Recuperação de Crédito — RS" className={inp} />
        </div>
        <div>
          <div className={lbl}>Descrição</div>
          <textarea name="description" rows={2} placeholder="o que essa carteira persegue" className={inp} />
        </div>
        <div>
          <div className={lbl}>Condições da oferta (travadas)</div>
          <textarea
            name="offerTerms"
            rows={2}
            placeholder='ex.: honorário de êxito ("só paga se recuperar"); caso único; escritório tria'
            className={inp}
          />
        </div>
        <div>
          <div className={lbl}>ICP</div>
          <textarea
            name="icp"
            rows={2}
            placeholder="ex.: indústria/distribuidora média, B2B, sem jurídico interno dono do contas a receber"
            className={inp}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={lbl}>Script (referência)</div>
            <input name="scriptRef" placeholder="docs/cold-call-recuperacao-credito-v2.md" className={inp} />
          </div>
          <div>
            <div className={lbl}>Status</div>
            <select name="status" defaultValue="ativa" className={inp}>
              <option value="ativa">ativa</option>
              <option value="pausada">pausada</option>
              <option value="arquivada">arquivada</option>
            </select>
          </div>
        </div>
        <button className="justify-self-start self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          Criar carteira
        </button>
      </form>
    </div>
  );
}
