import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { countCarteirasSemConta, getCampaignsWithStats, getDailyQueue, getTodayStats } from "@/db/queries";
import { getContaAtiva } from "@/lib/conta-server";
import { STAGE_LABELS, STAGE_ORDER, type Stage } from "@/core/pipeline";
import { ButtonLink, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUser();
  const conta = await getContaAtiva();
  const [camps, stats, q, semConta] = await Promise.all([
    getCampaignsWithStats(conta),
    getTodayStats(conta),
    getDailyQueue(conta),
    countCarteirasSemConta(),
  ]);
  const naFila = q.atrasadas.length + q.hoje.length + q.estadoZero.length;

  return (
    <div className="flex flex-col gap-6">
      {/* o dia a dia acontece na fila — a home só aponta pra lá */}
      <Link
        href="/fila"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
      >
        <div>
          <h2 className="font-semibold">▶ Fila do Dia</h2>
          <p className="text-sm text-zinc-500">
            {naFila > 0
              ? `${q.atrasadas.length} atrasadas · ${q.hoje.length} hoje · ${q.estadoZero.length} estado zero`
              : "fila vazia"}
          </p>
        </div>
        <div className="text-sm tabular-nums text-zinc-500">
          hoje{conta ? ` em ${conta}` : ""}: <strong className="text-zinc-900 dark:text-zinc-100">{stats.discadas}</strong> discadas ·{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{stats.conversas}</strong> conversas ·{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{stats.reunioes}</strong> reuniões
        </div>
      </Link>

      {/* carteira sem conta some do app enquanto houver filtro — avisa em vez de sumir calado */}
      {semConta > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          ⚠ {semConta} carteira(s) sem conta definida — elas só aparecem no modo “Todas as contas”. Abra a carteira →
          editar e escolha a conta.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Campanhas{conta ? <span className="text-zinc-400"> · {conta}</span> : null}
        </h1>
        <div className="flex gap-2">
          <ButtonLink href="/roleta" size="sm" variant="secondary">
            🎲 roleta
          </ButtonLink>
          <ButtonLink href="/importar" size="sm" variant="secondary">
            ⬆ importar leads
          </ButtonLink>
          <ButtonLink href="/campaigns/new" size="sm" variant="primary">
            + nova carteira
          </ButtonLink>
        </div>
      </div>

      {camps.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nenhuma campanha ainda. Rode <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run db:seed</code>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {camps.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.slug}`}
            className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{c.name}</h2>
              <Badge tone={c.status === "ativa" ? "emerald" : "neutral"} pill>
                {c.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {c.total} empresas{!conta && c.conta ? ` · ${c.conta}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGE_ORDER.filter((s) => c.byStage[s]).map((s) => (
                <Badge key={s} tone="neutral" className="px-1.5">
                  {STAGE_LABELS[s as Stage]}: <strong className="ml-0.5 font-semibold">{c.byStage[s]}</strong>
                </Badge>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
