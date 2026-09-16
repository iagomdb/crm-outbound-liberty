import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getScriptGraph, getScriptOptions } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FlowCanvas } from "@/components/flow/FlowCanvas";
import { opcoesSoltas } from "@/core/script-flow";
import { limparFluxo } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Monta o FLUXO da carteira num canvas de menus. Cada card é um momento da
 * conversa; cada bolinha é uma saída. A ligação sai da OPÇÃO e chega no MENU
 * inteiro — é isso que faz a variação nova custar zero ligação.
 *
 * Quem disca não vê este canvas: na ligação o mesmo fluxo vira colunas (aba 🌳),
 * que é o que funciona com uma mão no telefone.
 */
export default async function FluxoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const [graph, todas] = await Promise.all([getScriptGraph(campaign.id), getScriptOptions(campaign.id)]);
  const soltas = opcoesSoltas(graph, todas);
  const totalOpcoes = graph.menus.reduce((s, m) => s + m.opcoes.length, 0);
  const semEntrada = graph.menus.length > 0 && !graph.menus.some((m) => m.entrada);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Fluxo da ligação</h1>
        <p className="text-sm text-zinc-500">
          Cada card é um <strong>menu</strong> — um momento da conversa com várias saídas. Arraste do{" "}
          <strong>Default</strong> pra ligar o menu inteiro de uma vez; da bolinha de uma opção só quando ela for
          exceção.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {graph.menus.length} menus · {totalOpcoes} opções em uso
          {soltas.length > 0 && ` · ${soltas.length} fora de menu`}
        </p>
      </div>

      {semEntrada && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Nenhum menu está marcado como <strong>início</strong> — a ligação não tem por onde começar. Abra o card da
          abertura e marque.
        </p>
      )}

      <FlowCanvas campaignId={campaign.id} graph={graph} opcoesSoltas={soltas} todasOpcoes={todas} />

      {(graph.menus.length > 0 || todas.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-950 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de perigo</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Apaga os {graph.menus.length} menus e as {todas.length} opções desta carteira. As ligações já registradas
            continuam guardando o caminho percorrido (o título vai gravado junto), mas o Aprendizado por passo perde a
            referência.
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
