import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getAgenda } from "@/db/queries";
import { BUCKET_CLASSES, BUCKET_LABELS, BUCKET_ORDER, bucketFor, type Bucket } from "@/core/agenda";
import { completeReturn, snoozeReturn } from "./actions";
import { fmtDateTime } from "@/lib/format";
import { deathFor, DEATH_CLASSES } from "@/core/death";
import { STAGE_LABELS } from "@/core/pipeline";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

const snoozeBtn =
  "rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
const openBtn = "rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700";

export default async function AgendaPage() {
  await requireUser();
  const items = await getAgenda();
  const now = new Date();
  const groups: Record<Bucket, typeof items> = { atrasada: [], hoje: [], amanha: [], semana: [], depois: [] };
  for (const t of items) {
    if (!t.nextActionAt) continue;
    groups[bucketFor(new Date(t.nextActionAt), now)].push(t);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Agenda</h1>
        <p className="text-sm text-zinc-500">{items.length} retornos agendados</p>
      </div>

      {items.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Nenhum retorno agendado. Agende no lead (&quot;agendar retorno&quot;) ou ao registrar uma ligação.
        </p>
      )}

      {BUCKET_ORDER.filter((b) => groups[b].length > 0).map((b) => (
        <section key={b} className="flex flex-col gap-2">
          <h2 className={`text-sm font-semibold ${BUCKET_CLASSES[b]}`}>
            {BUCKET_LABELS[b]} <span className="text-zinc-400">· {groups[b].length}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
            {groups[b].map((t) => {
              const d = deathFor({ attempts: t.attempts, stageChangedAt: t.stageChangedAt });
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/targets/${t.id}`} className="font-medium hover:underline">
                      {t.company.nomeFantasia || t.company.razaoSocial}
                    </Link>
                    <div className="text-xs text-zinc-400">
                      {fmtDateTime(t.nextActionAt)} · {STAGE_LABELS[t.stage]} · {t.campaign.name}
                      {d.state !== "ok" && <span className={`ml-1 ${DEATH_CLASSES[d.state].text}`}>· {d.state}</span>}
                    </div>
                    {t.nextActionPretext && <div className="text-xs text-zinc-500">↪ {t.nextActionPretext}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <form action={snoozeReturn.bind(null, t.id, 1)}>
                      <button className={snoozeBtn}>+1d</button>
                    </form>
                    <form action={snoozeReturn.bind(null, t.id, 3)}>
                      <button className={snoozeBtn}>+3d</button>
                    </form>
                    <form action={snoozeReturn.bind(null, t.id, 7)}>
                      <button className={snoozeBtn}>+7d</button>
                    </form>
                    <Link href={`/fila/${t.id}`} className={openBtn}>
                      abrir task
                    </Link>
                    <form action={completeReturn.bind(null, t.id)}>
                      <ConfirmButton
                        message="Concluir SEM registrar ligação? O lead sai da fila sem contar tentativa — prefira “abrir task”."
                        className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-red-500"
                      >
                        concluir
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
