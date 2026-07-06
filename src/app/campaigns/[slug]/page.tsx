import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignBySlug, getFunnelMetrics, getQueue } from "@/db/queries";
import { KanbanBoard, type BoardColumn, type BoardItem } from "@/components/KanbanBoard";
import { moveTarget, archiveTarget } from "./actions";
import { goldenHourLabel } from "@/core/golden-hours";
import { diagnose, funnelRates, pct } from "@/core/funnel";
import { ACTIVE_STAGES, STAGE_LABELS } from "@/core/pipeline";
import { fmtCnpj, fmtPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

const GH_UI: Record<string, { txt: string; cls: string }> = {
  golden: { txt: "🔥 golden hour", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  ok: { txt: "horário ok", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
  ruim: { txt: "horário ruim", cls: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
};

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-lg bg-zinc-50 px-2 py-3 dark:bg-zinc-900">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function Arrow({ rate }: { rate: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-zinc-400">
      <span>→</span>
      <span className="text-[10px] tabular-nums">{rate}</span>
    </div>
  );
}

export default async function CampaignBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const [items, metrics] = await Promise.all([getQueue(campaign.id), getFunnelMetrics(campaign.id)]);
  const r = funnelRates(metrics);
  const diags = diagnose(metrics);
  const gh = GH_UI[goldenHourLabel()];

  const byStage: Record<string, BoardItem[]> = {};
  for (const s of ACTIVE_STAGES) byStage[s] = [];
  for (const t of items) {
    (byStage[t.stage] ??= []).push({
      id: t.id,
      company: t.company.nomeFantasia || t.company.razaoSocial,
      cnpj: fmtCnpj(t.company.cnpj),
      uf: t.company.uf,
      phone: fmtPhone(t.company.telefones?.[0]) || null,
      attempts: t.attempts,
      stageChangedAt: new Date(t.stageChangedAt).toISOString(),
      nextActionPretext: t.nextActionPretext,
    });
  }
  const columns: BoardColumn[] = ACTIVE_STAGES.map((s) => ({
    stage: s,
    label: STAGE_LABELS[s],
    items: byStage[s] ?? [],
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-xs text-zinc-400 hover:underline">
            ← campanhas
          </Link>
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-zinc-500">Kanban · {items.length} ativos · arraste os cards entre as colunas</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/companies/new?campaign=${slug}`}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            + empresa
          </Link>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${gh.cls}`}>{gh.txt}</span>
        </div>
      </div>

      {/* funil por razões */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Funil por razões</h2>
          <span className="text-xs text-zinc-400">
            hoje: {metrics.discadasHoje} discadas · {metrics.conversasHoje} conversas
          </span>
        </div>
        <div className="mt-3 flex items-stretch gap-1 text-center">
          <Tile label="Discadas" value={metrics.discadas} />
          <Arrow rate={pct(r.conversa)} />
          <Tile label="Conversas" value={metrics.conversas} />
          <Arrow rate={pct(r.qualif)} />
          <Tile label="Qualificados" value={metrics.qualificados} />
          <Arrow rate={pct(r.reuniao)} />
          <Tile label="Reuniões" value={metrics.reunioes} />
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          {diags.map((d, i) => (
            <li key={i} className={d.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
              {d.text}
            </li>
          ))}
        </ul>
      </section>

      {/* kanban */}
      {items.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Nenhum lead ativo. Importe empresas:{" "}
          <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run import -- arquivo.xlsx</code>
        </p>
      ) : (
        <KanbanBoard columns={columns} moveAction={moveTarget} archiveAction={archiveTarget} />
      )}
    </div>
  );
}
