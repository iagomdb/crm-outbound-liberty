import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getScriptGraph } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ScriptFlowEditor } from "@/components/flow/ScriptFlowEditor";
import { KIND_CLASSES, KIND_LABELS } from "@/core/script-flow";
import { limparFluxo } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Monta o FLUXO da carteira — o script ramificado que substitui ler um pitch de
 * cima a baixo. Editor e discagem são a mesma tela de colunas: o que você monta
 * aqui é literalmente o que aparece na aba 🌳 durante a ligação.
 */
export default async function FluxoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const graph = await getScriptGraph(campaign.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Fluxo da ligação</h1>
        <p className="text-sm text-zinc-500">
          O script como ele acontece de verdade: uma abertura, o que ele responde, pra onde você vai. Clique num card
          pra abrir a coluna seguinte — é a mesma navegação da discagem.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
          {(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${KIND_CLASSES[k].dot}`} />
              {KIND_LABELS[k]}
            </span>
          ))}
          <span className="text-zinc-400">
            {graph.nodes.length} passos · {graph.edges.length} ligações
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <ScriptFlowEditor campaignId={campaign.id} graph={graph} />
      </div>

      {graph.nodes.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-950 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de perigo</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Apaga os {graph.nodes.length} passos desta carteira. As ligações já registradas continuam guardando o
            caminho que percorreram (o título vai gravado junto), mas o Aprendizado por passo perde a referência.
          </p>
          <form action={limparFluxo.bind(null, campaign.id)} className="mt-3">
            <ConfirmButton
              message={`Apagar o fluxo inteiro da carteira "${campaign.name}"? Não tem volta.`}
              className="cursor-pointer rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Apagar fluxo
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}
