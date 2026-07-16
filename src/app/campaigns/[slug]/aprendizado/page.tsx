import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getAprendizado, getCampaignBySlug, getFunnelMetrics } from "@/db/queries";
import { OBJECTION_LABELS } from "@/core/pipeline";

export const dynamic = "force-dynamic";

const pctOf = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
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

  const [{ perdas, objecoes, frases }, metrics] = await Promise.all([
    getAprendizado(campaign.id),
    getFunnelMetrics(campaign.id),
  ]);

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
