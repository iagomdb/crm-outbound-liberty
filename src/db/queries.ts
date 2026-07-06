import { asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import { activities, campaigns, meetings, targets } from "./schema";
import { type Stage, TERMINAL_STAGES } from "@/core/pipeline";
import type { FunnelCounts } from "@/core/funnel";

export type CampaignStats = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  total: number;
  byStage: Record<string, number>;
};

/** Campanhas + contagem de alvos por estágio (pro overview). */
export async function getCampaignsWithStats(): Promise<CampaignStats[]> {
  const db = getDb();
  const camps = await db.select().from(campaigns).orderBy(asc(campaigns.createdAt));
  const rows = await db
    .select({ campaignId: targets.campaignId, stage: targets.stage, n: count() })
    .from(targets)
    .groupBy(targets.campaignId, targets.stage);

  return camps.map((c) => {
    const mine = rows.filter((r) => r.campaignId === c.id);
    const byStage: Record<string, number> = {};
    let total = 0;
    for (const r of mine) {
      byStage[r.stage] = r.n;
      total += r.n;
    }
    return { id: c.id, name: c.name, slug: c.slug, status: c.status, total, byStage };
  });
}

export async function getCampaignBySlug(slug: string) {
  const db = getDb();
  const [c] = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
  return c ?? null;
}

/**
 * Fila de ligação de uma campanha: exclui estágios terminais, ordena por
 * próxima ação (nulls first = nunca contatado, pode ligar já) e prioridade.
 */
export async function getQueue(campaignId: string) {
  const db = getDb();
  return db.query.targets.findMany({
    where: (t, { and, eq, notInArray, isNull }) =>
      and(eq(t.campaignId, campaignId), notInArray(t.stage, TERMINAL_STAGES), isNull(t.archivedAt)),
    with: {
      company: true,
      primaryContact: true,
    },
    orderBy: (t) => [sql`${t.nextActionAt} asc nulls first`, desc(t.priority), asc(t.createdAt)],
    limit: 200,
  });
}

/** Agenda: todos os retornos agendados (nextActionAt) de leads ativos, por data. */
export async function getAgenda() {
  const db = getDb();
  return db.query.targets.findMany({
    where: (t, { and, isNotNull, isNull }) => and(isNotNull(t.nextActionAt), isNull(t.archivedAt)),
    with: { company: true, campaign: true },
    orderBy: (t, { asc }) => [asc(t.nextActionAt)],
    limit: 300,
  });
}

/** Detalhe de um alvo: empresa + contatos + histórico de ligações + reuniões. */
export async function getTargetDetail(id: string) {
  const db = getDb();
  return db.query.targets.findFirst({
    where: (t, { eq }) => eq(t.id, id),
    with: {
      campaign: true,
      primaryContact: true,
      company: {
        with: {
          contacts: {
            orderBy: (c, { asc }) => [asc(c.createdAt)],
          },
        },
      },
      activities: {
        orderBy: (a, { desc }) => [desc(a.occurredAt)],
        with: { contact: true },
        limit: 50,
      },
      meetings: {
        orderBy: (m, { desc }) => [desc(m.scheduledAt)],
      },
    },
  });
}

/** Funil por razões de uma campanha (discadas → conversas → qualificados → reuniões). */
export async function getFunnelMetrics(campaignId: string): Promise<FunnelCounts> {
  const db = getDb();

  const [acts] = await db
    .select({
      discadas: sql<number>`(count(*) filter (where ${activities.type} in ('ligacao','voicemail')))::int`,
      conversas: sql<number>`(count(*) filter (where ${activities.reachedHuman}))::int`,
      discadasHoje: sql<number>`(count(*) filter (where ${activities.type} in ('ligacao','voicemail') and ${activities.occurredAt} >= date_trunc('day', now())))::int`,
      conversasHoje: sql<number>`(count(*) filter (where ${activities.reachedHuman} and ${activities.occurredAt} >= date_trunc('day', now())))::int`,
    })
    .from(activities)
    .innerJoin(targets, eq(activities.targetId, targets.id))
    .where(eq(targets.campaignId, campaignId));

  const [tgt] = await db
    .select({
      qualificados: sql<number>`(count(*) filter (where ${targets.qualified} or ${targets.stage} in ('qualificado','reuniao_agendada','handoff','ganho')))::int`,
    })
    .from(targets)
    .where(eq(targets.campaignId, campaignId));

  const [mtg] = await db
    .select({ reunioes: sql<number>`(count(*))::int` })
    .from(meetings)
    .innerJoin(targets, eq(meetings.targetId, targets.id))
    .where(eq(targets.campaignId, campaignId));

  return {
    discadas: acts?.discadas ?? 0,
    conversas: acts?.conversas ?? 0,
    discadasHoje: acts?.discadasHoje ?? 0,
    conversasHoje: acts?.conversasHoje ?? 0,
    qualificados: tgt?.qualificados ?? 0,
    reunioes: mtg?.reunioes ?? 0,
  };
}

export type QueueItem = Awaited<ReturnType<typeof getQueue>>[number];
export type TargetDetail = NonNullable<Awaited<ReturnType<typeof getTargetDetail>>>;
export type { Stage };
