import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getDailyQueue, getOrphans, getTodayStats, type FilaItem } from "@/db/queries";
import { deathFor, deathLabel, DEATH_CLASSES } from "@/core/death";
import { STAGE_LABELS } from "@/core/pipeline";
import { goldenHourLabel } from "@/core/golden-hours";
import { fmtDateTime, fmtPhone } from "@/lib/format";
import { Badge, ButtonLink, type BadgeTone } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Meta do playbook: bloco de discagem diário. */
const META_DISCADAS_DIA = 30;

const GH_UI: Record<string, { txt: string; tone: BadgeTone }> = {
  golden: { txt: "🔥 golden hour", tone: "emerald" },
  ok: { txt: "horário ok", tone: "neutral" },
  ruim: { txt: "horário ruim", tone: "orange" },
};

function Stat({ label, value, meta }: { label: string; value: number; meta?: number }) {
  return (
    <div className="flex-1 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
      <div className="text-xl font-semibold tabular-nums">
        {value}
        {meta ? <span className="text-sm font-normal text-zinc-400"> / {meta}</span> : null}
      </div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function FilaRow({ t, hint }: { t: FilaItem; hint: string }) {
  const d = deathFor({ attempts: t.attempts, stageChangedAt: t.stageChangedAt });
  return (
    <li>
      <Link
        href={`/fila/${t.id}`}
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <div className="min-w-0">
          <span className="font-medium">{t.nomeFantasia || t.razaoSocial}</span>
          <span className="ml-2 text-xs text-zinc-400">
            {fmtPhone(t.telefones?.[0]) || "sem telefone"} · {STAGE_LABELS[t.stage]} · {hint}
          </span>
          <div className="text-xs text-zinc-500">
            ↪ {t.nextActionPretext || (t.attempts === 0 ? "primeira ligação — abrir com a hipótese" : "sem pretexto definido")}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-400">tentativa nº {t.attempts + 1}</span>
          <span className={DEATH_CLASSES[d.state].text}>{deathLabel(d)}</span>
          <div className="h-1.5 w-16 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            <div className={`h-full ${DEATH_CLASSES[d.state].bar}`} style={{ width: `${Math.round(d.score * 100)}%` }} />
          </div>
        </div>
      </Link>
    </li>
  );
}

function Section({ title, cls, items, hintFor }: { title: string; cls: string; items: FilaItem[]; hintFor: (t: FilaItem) => string }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`text-sm font-semibold ${cls}`}>
        {title} <span className="font-normal text-zinc-400">· {items.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
        {items.map((t) => (
          <FilaRow key={t.id} t={t} hint={hintFor(t)} />
        ))}
      </ul>
    </section>
  );
}

export default async function FilaPage() {
  await requireUser();
  const [q, stats, orphans] = await Promise.all([getDailyQueue(), getTodayStats(), getOrphans()]);
  const gh = GH_UI[goldenHourLabel()];
  const total = q.atrasadas.length + q.hoje.length + q.estadoZero.length;
  const first = [...q.atrasadas, ...q.hoje, ...q.estadoZero][0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Fila do Dia</h1>
          <p className="text-sm text-zinc-500">{total} tasks — desce de cima pra baixo, uma decisão por lead</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={gh.tone} pill className="px-3 py-1">
            {gh.txt}
          </Badge>
          {first && (
            <ButtonLink href={`/fila/${first.id}`} variant="primary" size="sm">
              ▶ começar
            </ButtonLink>
          )}
        </div>
      </div>

      {/* medição do dia (Fase 5) */}
      <div className="flex gap-2">
        <Stat label="discadas hoje" value={stats.discadas} meta={META_DISCADAS_DIA} />
        <Stat label="conversas hoje" value={stats.conversas} />
        <Stat label="reuniões hoje" value={stats.reunioes} />
      </div>

      {/* guarda-corpo (Fase 4): órfãos não deveriam existir após a regra de ouro */}
      {orphans.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">⚠ {orphans.length} lead(s) órfão(s): ativos sem task e sem fim de ciclo.</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {orphans.map((t) => (
              <li key={t.id}>
                <Link href={`/fila/${t.id}`} className="underline">
                  {t.nomeFantasia || t.razaoSocial}
                </Link>{" "}
                — {STAGE_LABELS[t.stage]}, {t.attempts} tentativa(s). Abra e decida: nova task ou fim de ciclo.
              </li>
            ))}
          </ul>
        </div>
      )}

      {total === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Fila vazia. Importe empresas (<code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run import</code>) e
          faça a triagem de ICP na campanha.
        </p>
      )}

      <Section
        title="🔴 Atrasadas"
        cls="text-red-600 dark:text-red-400"
        items={q.atrasadas}
        hintFor={(t) => `venceu ${fmtDateTime(t.nextActionAt)}`}
      />
      <Section
        title="🟢 Hoje"
        cls="text-emerald-600 dark:text-emerald-400"
        items={q.hoje}
        hintFor={(t) => fmtDateTime(t.nextActionAt)}
      />
      <Section
        title="⚪ Estado zero (primeira ligação)"
        cls="text-zinc-500"
        items={q.estadoZero}
        hintFor={(t) => t.campaignName}
      />
    </div>
  );
}
