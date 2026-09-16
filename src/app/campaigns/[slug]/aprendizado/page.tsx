import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getAprendizado, getCaminhoRows, getCampaignBySlug, getFunnelMetrics, getScriptGraph } from "@/db/queries";
import { OBJECTION_LABELS } from "@/core/pipeline";
import { KIND_CLASSES, statsDeAbertura, statsPorNo, type NodeKind, type NodeStat } from "@/core/script-flow";

export const dynamic = "force-dynamic";

const pctOf = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

/** Uma linha de estatística de passo: quantas passaram e quanto virou objetivo. */
function StatRow({ stat }: { stat: NodeStat }) {
  const conv = stat.reuniao + stat.email;
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${KIND_CLASSES[stat.kind as NodeKind]?.dot ?? "bg-zinc-400"}`} />
        <span className="truncate">{stat.titulo}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
        <span className="tabular-nums">{stat.passou}× usada</span>
        <span
          className={conv > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}
          title={`${stat.reuniao} reuniões · ${stat.email} e-mails nominais`}
        >
          {pctOf(conv, stat.passou)} objetivo
        </span>
      </span>
    </li>
  );
}

/**
 * Aprendizado (pós-mortem contínuo): depois de N ligações, onde se perde, o que
 * objetam e as frases exatas onde a conversa morre — pra ajustar o script com
 * dado, não com impressão.
 */
export default async function AprendizadoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const [{ perdas, objecoes, frases }, metrics, caminhos, graph] = await Promise.all([
    getAprendizado(campaign.id),
    getFunnelMetrics(campaign.id),
    getCaminhoRows(campaign.id),
    getScriptGraph(campaign.id),
  ]);

  // o que o fluxo ensinou: por onde a conversa passou e onde ela morreu.
  // Vem do caminho clicado na ligação — nada disso é digitado à mão.
  const entradaIds = new Set(graph.nodes.filter((n) => n.entrada).map((n) => n.id));
  const aberturas = statsDeAbertura(caminhos, entradaIds);
  const passos = statsPorNo(caminhos);
  const mortes = [...passos].filter((p) => p.morreu > 0).sort((a, b) => b.morreu - a.morreu);

  const totalPerdas = perdas.reduce((s, p) => s + p.n, 0);
  const totalObjecoes = objecoes.reduce((s, o) => s + o.n, 0);
  const maxPerda = perdas[0]?.n ?? 0;
  const maxObjecao = objecoes[0]?.n ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Aprendizado</h1>
        <p className="text-sm text-zinc-500">
          O que {metrics.discadas} discadas e {metrics.conversas} conversas ensinaram — onde se perde, o que objetam,
          onde a conversa morre.
        </p>
      </div>

      {/* o fluxo: qual abertura converte */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">🌳 Aberturas — qual entra melhor</h2>
          <span className="text-xs text-zinc-400">{caminhos.length} ligações passaram pelo fluxo</span>
        </div>
        {aberturas.length === 0 ? (
          <Empty>
            Nada ainda. Monte o fluxo em{" "}
            <Link href={`/campaigns/${slug}/fluxo`} className="text-sky-600 hover:underline dark:text-sky-400">
              🌳 fluxo
            </Link>{" "}
            e navegue por ele durante a ligação — o caminho vira estatística sozinho.
          </Empty>
        ) : (
          <>
            <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
              {aberturas.map((a) => (
                <StatRow key={a.nodeId} stat={a} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-400">
              O playbook manda testar em blocos de ~20 ligações por variante, sem misturar. Abertura com menos de 20
              ligações ainda não diz nada.
            </p>
          </>
        )}
      </section>

      {/* o fluxo: onde a conversa morre */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">🪦 Onde a conversa morre</h2>
          <span className="text-xs text-zinc-400">último passo em ligação com humano e sem objetivo batido</span>
        </div>
        {mortes.length === 0 ? (
          <Empty>Nenhuma conversa morreu no meio do fluxo ainda.</Empty>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {mortes.slice(0, 15).map((m) => (
              <li key={m.nodeId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${KIND_CLASSES[m.kind as NodeKind]?.dot ?? "bg-zinc-400"}`} />
                  <span className="truncate">{m.titulo}</span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  morreu <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">{m.morreu}</strong>×{" "}
                  <span className="text-zinc-400">de {m.passou} passagens</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* o fluxo: passo a passo */}
      {passos.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Passos mais percorridos</h2>
            <span className="text-xs text-zinc-400">{passos.length} passos usados</span>
          </div>
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {passos.slice(0, 20).map((p) => (
              <StatRow key={p.nodeId} stat={p} />
            ))}
          </ul>
        </section>
      )}

      {/* motivos de perda */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Motivos de perda</h2>
          <span className="text-xs text-zinc-400">{totalPerdas} leads fora do ciclo</span>
        </div>
        {perdas.length === 0 ? (
          <Empty>Nenhuma perda registrada ainda — bom sinal (ou cedo demais).</Empty>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {perdas.map((p) => (
              <li key={p.reason} className="flex items-center gap-3 text-sm">
                <span className="w-56 shrink-0 truncate sm:w-72" title={p.reason}>
                  {p.reason}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded bg-red-400/80 dark:bg-red-500/60" style={{ width: `${(p.n / maxPerda) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {pctOf(p.n, totalPerdas)} <span className="text-xs text-zinc-400">({p.n})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* top objeções */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Top objeções</h2>
          <span className="text-xs text-zinc-400">{totalObjecoes} objeções ouvidas</span>
        </div>
        {objecoes.length === 0 ? (
          <Empty>Nenhuma objeção registrada ainda. Elas entram pelo formulário de registro de ligação.</Empty>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {objecoes.map((o) => (
              <li key={o.objection} className="flex items-center gap-3 text-sm">
                <span className="w-56 shrink-0 truncate sm:w-72">
                  “{OBJECTION_LABELS[o.objection] ?? o.objection}”
                  {o.reflexo > 0 && (
                    <span className="ml-1.5 text-xs text-zinc-400" title="quantas eram reflexo, não objeção real">
                      {o.reflexo} reflexo
                    </span>
                  )}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded bg-amber-400/80 dark:bg-amber-500/60" style={{ width: `${(o.n / maxObjecao) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {pctOf(o.n, totalObjecoes)} <span className="text-xs text-zinc-400">({o.n})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* frases onde a conversa morreu */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Frases onde a conversa morreu</h2>
          <span className="text-xs text-zinc-400">o &quot;travou em&quot; do registro de ligação, agrupado</span>
        </div>
        {frases.length === 0 ? (
          <Empty>Nada ainda — preencha o &quot;onde travou&quot; ao registrar a ligação e isso monta sozinho.</Empty>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {frases.map((f) => (
              <li key={f.frase} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium">“{f.frase}”</span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {f.n} {f.n === 1 ? "vez" : "vezes"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
