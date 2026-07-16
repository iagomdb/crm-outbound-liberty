import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { updateCampaign, deleteCampaign } from "../../actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";

export default async function EditCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Editar carteira</h1>
        <p className="text-sm text-zinc-500">
          URL fixa: <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">/campaigns/{slug}</code>
        </p>
      </div>

      <form
        action={updateCampaign.bind(null, campaign.id)}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div>
          <div className={lbl}>Nome *</div>
          <input name="name" required defaultValue={campaign.name} className={inp} />
        </div>
        <div>
          <div className={lbl}>Descrição</div>
          <textarea name="description" rows={2} defaultValue={campaign.description ?? ""} className={inp} />
        </div>
        <div>
          <div className={lbl}>Condições da oferta (travadas)</div>
          <textarea name="offerTerms" rows={2} defaultValue={campaign.offerTerms ?? ""} className={inp} />
        </div>
        <div>
          <div className={lbl}>ICP</div>
          <textarea name="icp" rows={2} defaultValue={campaign.icp ?? ""} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={lbl}>Script (referência)</div>
            <input name="scriptRef" defaultValue={campaign.scriptRef ?? ""} className={inp} />
          </div>
          <div>
            <div className={lbl}>Status</div>
            <select name="status" defaultValue={campaign.status} className={inp}>
              <option value="ativa">ativa</option>
              <option value="pausada">pausada</option>
              <option value="arquivada">arquivada</option>
            </select>
          </div>
        </div>
        <button className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          Salvar
        </button>
      </form>

      {/* zona de perigo */}
      <div className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-950 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de perigo</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Apagar a carteira apaga TODOS os alvos, ligações, reuniões e histórico dela — sem volta. As empresas são
          globais e continuam cadastradas. Pra só tirar de circulação, use o status <strong>arquivada</strong> acima.
        </p>
        <form action={deleteCampaign.bind(null, campaign.id)} className="mt-3">
          <ConfirmButton
            message={`Apagar a carteira "${campaign.name}" e TODO o histórico dela (alvos, ligações, reuniões)? Não tem volta.`}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Apagar carteira
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
