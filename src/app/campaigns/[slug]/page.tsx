import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getFunnelMetrics, getQueue, getTriagemCount } from "@/db/queries";
import { KanbanBoard, type BoardColumn, type BoardItem } from "@/components/KanbanBoard";
import { Card, Badge, ButtonLink, type BadgeTone } from "@/components/ui";
import { moveTarget, archiveTarget } from "./actions";
import { goldenHourLabel } from "@/core/golden-hours";
import { diagnose, funnelRates, pct } from "@/core/funnel";
import { ACTIVE_STAGES, STAGE_LABELS } from "@/core/pipeline";
import { fmtCnpj, fmtPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

const GH_UI: Record<string, { txt: string; tone: BadgeTone }> = {
  golden: { txt: "🔥 golden hour", tone: "emerald" },
  ok: { txt: "horário ok", tone: "neutral" },
  ruim: { txt: "horário ruim", tone: "orange" },
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
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const [items, metrics, triagemPendente] = await Promise.all([
    getQueue(campaign.id),
    getFunnelMetrics(campaign.id),
    getTriagemCount(campaign.id),
  ]);
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
          <p className="text-sm text-zinc-500">
            Kanban · {items.length} ativos · arraste os cards ou use &quot;mover ➜&quot; direto no card
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* status, não ação — indicador do momento do dia */}
          <Badge tone={gh.tone} pill className="px-3 py-1">
            {gh.txt}
          </Badge>
          {/* separador visual entre indicador e ações */}
          <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
          {/* triagem pendente exige atenção — destaca em âmbar quando há fila */}
          <ButtonLink
            href={`/campaigns/${slug}/triagem`}
            size="sm"
            variant="secondary"
            className={
              triagemPendente > 0
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : undefined
            }
          >
            triagem ICP{triagemPendente > 0 ? ` · ${triagemPendente}` : ""}
          </ButtonLink>
          <ButtonLink href={`/campaigns/${slug}/fora-do-ciclo`} size="sm" variant="ghost">
            fora do ciclo
          </ButtonLink>
          <ButtonLink href={`/campaigns/${slug}/aprendizado`} size="sm" variant="ghost">
            aprendizado
          </ButtonLink>
          <ButtonLink href={`/campaigns/${slug}/editar`} size="sm" variant="ghost">
            editar
          </ButtonLink>
          {/* ação de criação — primária */}
          <ButtonLink href={`/companies/new?campaign=${slug}`} size="sm" variant="primary">
            + empresa
          </ButtonLink>
        </div>
      </div>

      {/* funil por razões */}
      <Card
        title="Funil por razões"
        aside={
          <span className="text-xs text-zinc-400">
            hoje: {metrics.discadasHoje} discadas · {metrics.conversasHoje} conversas
          </span>
        }
      >
        <div className="flex items-stretch gap-1 text-center">
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
      </Card>

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
