import Link from "next/link";
import { getCampaignsWithStats, getDailyQueue, getTodayStats } from "@/db/queries";
import { STAGE_LABELS, STAGE_ORDER, type Stage } from "@/core/pipeline";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [camps, stats, q] = await Promise.all([getCampaignsWithStats(), getTodayStats(), getDailyQueue()]);
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
          hoje: <strong className="text-zinc-900 dark:text-zinc-100">{stats.discadas}</strong> discadas ·{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{stats.conversas}</strong> conversas ·{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{stats.reunioes}</strong> reuniões
        </div>
      </Link>

      <h1 className="text-xl font-semibold">Campanhas</h1>

      {camps.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nenhuma campanha ainda. Rode <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run db:seed</code>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {camps.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.slug}`}
            className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{c.name}</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                {c.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{c.total} empresas</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGE_ORDER.filter((s) => c.byStage[s]).map((s) => (
                <span
                  key={s}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {STAGE_LABELS[s as Stage]}: <strong className="font-semibold">{c.byStage[s]}</strong>
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
