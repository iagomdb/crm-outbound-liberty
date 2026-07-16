import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getCampaignsWithStats } from "@/db/queries";
import { MaskedInput } from "@/components/MaskedInput";
import { createCompany } from "../actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  await requireUser();
  const { campaign } = await searchParams;
  const camps = await getCampaignsWithStats();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href={campaign ? `/campaigns/${campaign}` : "/"} className="text-xs text-zinc-400 hover:underline">
          ← voltar
        </Link>
        <h1 className="text-xl font-semibold">Nova empresa</h1>
      </div>

      <form action={createCompany} className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="col-span-2">
          <div className={lbl}>Razão social *</div>
          <input name="razaoSocial" required className={inp} />
        </div>
        <div>
          <div className={lbl}>CNPJ *</div>
          <MaskedInput mask="cnpj" name="cnpj" required className={inp} />
        </div>
        <div>
          <div className={lbl}>Nome fantasia</div>
          <input name="nomeFantasia" className={inp} />
        </div>
        <div>
          <div className={lbl}>Telefone 1</div>
          <MaskedInput mask="phone" name="tel1" className={inp} />
        </div>
        <div>
          <div className={lbl}>Telefone 2</div>
          <MaskedInput mask="phone" name="tel2" className={inp} />
        </div>
        <div>
          <div className={lbl}>E-mail 1</div>
          <input name="email1" className={inp} />
        </div>
        <div>
          <div className={lbl}>E-mail 2</div>
          <input name="email2" className={inp} />
        </div>
        <div className="col-span-2">
          <div className={lbl}>CNAE principal</div>
          <input name="cnaePrincipal" className={inp} />
        </div>
        <div>
          <div className={lbl}>Porte</div>
          <input name="porte" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={lbl}>UF</div>
            <MaskedInput mask="uf" name="uf" maxLength={2} className={inp} />
          </div>
          <div>
            <div className={lbl}>Município</div>
            <input name="municipio" className={inp} />
          </div>
        </div>
        <div className="col-span-2">
          <div className={lbl}>Adicionar à campanha</div>
          <select name="campaignSlug" defaultValue={campaign ?? ""} className={inp}>
            <option value="">— nenhuma (só cadastrar) —</option>
            {camps.map((c) => (
              <option key={c.id} value={c.slug ?? ""}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="col-span-2 justify-self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          Criar empresa
        </button>
      </form>
    </div>
  );
}
