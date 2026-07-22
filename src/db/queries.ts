import { and, asc, count, desc, eq, inArray, isNull, lt, not, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import { activities, campaigns, checklistItems, companies, contacts, emailTemplates, meetings, targets } from "./schema";
import type { IcpRawCall, IcpRawMeeting, IcpRawTarget } from "@/core/icp-stats";
import { type Stage, TERMINAL_STAGES } from "@/core/pipeline";
import { CYCLE_END_STAGES } from "@/core/tasks";
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

// ---------------------------------------------------------------- estatísticas de ICP

/** Linhas cruas pro dashboard de ICP (o cálculo fica em core/icp-stats.ts). */
export async function getIcpRawData(): Promise<{
  camps: { id: string; name: string; slug: string | null; status: string }[];
  rawTargets: IcpRawTarget[];
  rawCalls: IcpRawCall[];
  rawMeetings: IcpRawMeeting[];
}> {
  const db = getDb();

  const camps = await db
    .select({ id: campaigns.id, name: campaigns.name, slug: campaigns.slug, status: campaigns.status })
    .from(campaigns)
    .orderBy(asc(campaigns.createdAt));

  const rawTargets: IcpRawTarget[] = await db
    .select({
      targetId: targets.id,
      campaignId: targets.campaignId,
      icpGrade: targets.icpGrade,
      tipoCobranca: companies.tipoCobranca,
    })
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id));

  const callRows = await db
    .select({
      targetId: activities.targetId,
      campaignId: targets.campaignId,
      occurredAt: activities.occurredAt,
      reachedHuman: activities.reachedHuman,
      dorPercebida: activities.dorPercebida,
      papel: contacts.papel,
      objection: activities.objection,
      stalledAt: activities.stalledAt,
      objectiveHit: activities.objectiveHit,
    })
    .from(activities)
    .innerJoin(targets, eq(activities.targetId, targets.id))
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .where(eq(activities.type, "ligacao"));

  const rawCalls: IcpRawCall[] = callRows.map((r) => ({
    targetId: r.targetId,
    campaignId: r.campaignId,
    occurredAt: r.occurredAt,
    reachedHuman: r.reachedHuman,
    dorPercebida: r.dorPercebida,
    falouComDecisor: r.papel === "decisor",
    objection: r.objection,
    stalledAt: r.stalledAt,
    objectiveHit: r.objectiveHit,
  }));

  const rawMeetings: IcpRawMeeting[] = await db
    .select({ campaignId: targets.campaignId, targetId: meetings.targetId })
    .from(meetings)
    .innerJoin(targets, eq(meetings.targetId, targets.id));

  return { camps, rawTargets, rawCalls, rawMeetings };
}

/** Itens do checklist da carteira, na ordem definida (pro editor e pras telas de ligação). */
export async function getChecklistItems(campaignId: string) {
  const db = getDb();
  return db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.campaignId, campaignId))
    .orderBy(asc(checklistItems.ordem), asc(checklistItems.createdAt));
}

// ---------------------------------------------------------------- roleta (randomizador de ligação)

/** Estágios que entram no sorteio: leads frescos, sem cadência em andamento. */
const ROLETA_STAGES: Stage[] = ["novo", "fit"];

export type RoletaCampaign = { id: string; name: string; slug: string | null; disponiveis: number };

/** Carteiras ativas + quantos alvos "novo"/"fit" cada uma tem disponíveis pro sorteio. */
export async function getRoletaCampaigns(): Promise<RoletaCampaign[]> {
  const db = getDb();
  return db
    .select({ id: campaigns.id, name: campaigns.name, slug: campaigns.slug, disponiveis: count(targets.id) })
    .from(campaigns)
    .leftJoin(
      targets,
      and(eq(targets.campaignId, campaigns.id), isNull(targets.archivedAt), inArray(targets.stage, ROLETA_STAGES)),
    )
    .where(eq(campaigns.status, "ativa"))
    .groupBy(campaigns.id)
    .orderBy(asc(campaigns.createdAt));
}

/** Sorteia um alvo "novo"/"fit" dentro das carteiras selecionadas (slugs). */
export async function getRandomRoletaTarget(slugs: string[], excludeId?: string): Promise<string | null> {
  if (!slugs.length) return null;
  const db = getDb();
  const conds = [isNull(targets.archivedAt), inArray(targets.stage, ROLETA_STAGES), inArray(campaigns.slug, slugs)];
  if (excludeId) conds.push(not(eq(targets.id, excludeId)));
  const [row] = await db
    .select({ id: targets.id })
    .from(targets)
    .innerJoin(campaigns, eq(targets.campaignId, campaigns.id))
    .where(and(...conds))
    .orderBy(sql`random()`)
    .limit(1);
  return row?.id ?? null;
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
      campaign: {
        with: {
          checklistItems: { orderBy: (c, { asc }) => [asc(c.ordem), asc(c.createdAt)] },
        },
      },
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

// ---------------------------------------------------------------- Fila do Dia (roadmap Fase 3)

const filaRow = {
  id: targets.id,
  stage: targets.stage,
  attempts: targets.attempts,
  stageChangedAt: targets.stageChangedAt,
  nextActionAt: targets.nextActionAt,
  nextActionPretext: targets.nextActionPretext,
  priority: targets.priority,
  campaignId: targets.campaignId,
  campaignName: campaigns.name,
  razaoSocial: companies.razaoSocial,
  nomeFantasia: companies.nomeFantasia,
  telefones: companies.telefones,
  uf: companies.uf,
  municipio: companies.municipio,
};

const activeTarget = and(isNull(targets.archivedAt), notInArray(targets.stage, CYCLE_END_STAGES));

/**
 * A Fila do Dia: atrasadas → hoje → estado zero (novos triados como fit, a
 * "task implícita" da primeira ligação). Desce de cima pra baixo e liga.
 */
export async function getDailyQueue(now = new Date()) {
  const db = getDb();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);

  const due = await db
    .select(filaRow)
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .innerJoin(campaigns, eq(targets.campaignId, campaigns.id))
    .where(and(isNull(targets.archivedAt), lt(targets.nextActionAt, startTomorrow)))
    .orderBy(asc(targets.nextActionAt))
    .limit(200);

  const estadoZero = await db
    .select(filaRow)
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .innerJoin(campaigns, eq(targets.campaignId, campaigns.id))
    .where(
      and(
        isNull(targets.archivedAt),
        // triado como fit (a triagem move novo → fit) e ainda sem primeira ligação
        eq(targets.stage, "fit"),
        eq(targets.attempts, 0),
        isNull(targets.nextActionAt),
      ),
    )
    .orderBy(desc(targets.priority), asc(targets.createdAt))
    .limit(200);

  return {
    atrasadas: due.filter((t) => t.nextActionAt! < startToday),
    hoje: due.filter((t) => t.nextActionAt! >= startToday),
    estadoZero,
  };
}

/** Próximo alvo da fila (modo discagem: zero cliques entre ligações). */
export async function getNextInQueue(excludeTargetId: string): Promise<string | null> {
  const q = await getDailyQueue();
  const next = [...q.atrasadas, ...q.hoje, ...q.estadoZero].find((t) => t.id !== excludeTargetId);
  return next?.id ?? null;
}

/**
 * Varredura de órfãos (roadmap Fase 4): alvo ativo SEM task e SEM estágio
 * terminal — não deveria existir depois da regra de ouro. Estado zero
 * (novo, 0 tentativas) não é órfão: ainda nem entrou no ciclo.
 */
export async function getOrphans() {
  const db = getDb();
  return db
    .select(filaRow)
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .innerJoin(campaigns, eq(targets.campaignId, campaigns.id))
    .where(
      and(
        activeTarget,
        isNull(targets.nextActionAt),
        // pré-ciclo (novo/fit sem tentativa) não é órfão: ainda nem entrou no ciclo
        not(and(inArray(targets.stage, ["novo", "fit"]), eq(targets.attempts, 0))!),
      ),
    )
    .limit(50);
}

/** Medição do dia (roadmap Fase 5): discadas / conversas / reuniões de HOJE. */
export async function getTodayStats() {
  const db = getDb();
  const today = sql`date_trunc('day', now())`;
  const [a] = await db
    .select({
      discadas: sql<number>`(count(*) filter (where ${activities.type} in ('ligacao','voicemail')))::int`,
      conversas: sql<number>`(count(*) filter (where ${activities.reachedHuman}))::int`,
    })
    .from(activities)
    .where(sql`${activities.occurredAt} >= ${today}`);
  const [m] = await db
    .select({ reunioes: sql<number>`(count(*))::int` })
    .from(meetings)
    .where(sql`${meetings.createdAt} >= ${today}`);
  return { discadas: a?.discadas ?? 0, conversas: a?.conversas ?? 0, reunioes: m?.reunioes ?? 0 };
}

// ---------------------------------------------------------------- triagem de ICP (roadmap Fase 1)

/** Alvos da campanha cuja empresa ainda não foi triada (icpFit null). */
export async function getTriagemQueue(campaignId: string) {
  const db = getDb();
  return db
    .select({
      targetId: targets.id,
      companyId: companies.id,
      razaoSocial: companies.razaoSocial,
      nomeFantasia: companies.nomeFantasia,
      cnpj: companies.cnpj,
      cnaePrincipal: companies.cnaePrincipal,
      porte: companies.porte,
      capitalSocial: companies.capitalSocial,
      uf: companies.uf,
      municipio: companies.municipio,
    })
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .where(and(eq(targets.campaignId, campaignId), isNull(targets.archivedAt), isNull(companies.icpFit)))
    .orderBy(asc(companies.razaoSocial))
    .limit(500);
}

export async function getTriagemCount(campaignId: string): Promise<number> {
  const db = getDb();
  const [r] = await db
    .select({ n: count() })
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .where(and(eq(targets.campaignId, campaignId), isNull(targets.archivedAt), isNull(companies.icpFit)));
  return r?.n ?? 0;
}

// ---------------------------------------------------------------- fora do ciclo (roadmap Fase 4)

/** Fins de ciclo da campanha: arquivados + estágios terminais, com motivo e data. */
export async function getForaDoCiclo(campaignId: string) {
  const db = getDb();
  return db
    .select({
      id: targets.id,
      stage: targets.stage,
      attempts: targets.attempts,
      archivedAt: targets.archivedAt,
      archiveReason: targets.archiveReason,
      lostReason: targets.lostReason,
      nextActionAt: targets.nextActionAt,
      nextActionPretext: targets.nextActionPretext,
      stageChangedAt: targets.stageChangedAt,
      razaoSocial: companies.razaoSocial,
      nomeFantasia: companies.nomeFantasia,
    })
    .from(targets)
    .innerJoin(companies, eq(targets.companyId, companies.id))
    .where(
      and(
        eq(targets.campaignId, campaignId),
        or(sql`${targets.archivedAt} is not null`, notInArray(targets.stage, ACTIVE_ONLY)),
      ),
    )
    .orderBy(desc(targets.updatedAt))
    .limit(500);
}

const ACTIVE_ONLY: Stage[] = ["novo", "fit", "tentando", "conversa", "qualificado", "reuniao_agendada"];

// ---------------------------------------------------------------- aprendizado (o que as ligações ensinaram)

/**
 * Agregados de aprendizado da campanha: motivos de perda (perdidos + arquivados),
 * objeções mais ouvidas (com quantas eram só reflexo) e as frases exatas onde a
 * conversa morreu (stalledAt). Agrupamento por texto normalizado (lower/trim)
 * pra "Sem tempo" e "sem tempo " contarem juntos.
 */
export async function getAprendizado(campaignId: string) {
  const db = getDb();

  const lossReason = sql`coalesce(nullif(trim(${targets.archiveReason}), ''), nullif(trim(${targets.lostReason}), ''), 'não informado')`;
  const perdas = await db
    .select({ reason: sql<string>`min(${lossReason})`, n: count() })
    .from(targets)
    .where(
      and(
        eq(targets.campaignId, campaignId),
        or(sql`${targets.archivedAt} is not null`, eq(targets.stage, "perdido")),
      ),
    )
    .groupBy(sql`lower(${lossReason})`)
    .orderBy(desc(count()));

  const objecoes = await db
    .select({
      objection: activities.objection,
      n: count(),
      reflexo: sql<number>`(count(*) filter (where ${activities.objectionIsReflexo}))::int`,
    })
    .from(activities)
    .innerJoin(targets, eq(activities.targetId, targets.id))
    .where(and(eq(targets.campaignId, campaignId), sql`${activities.objection} <> 'nenhuma'`))
    .groupBy(activities.objection)
    .orderBy(desc(count()));

  const frase = sql`trim(${activities.stalledAt})`;
  const frases = await db
    .select({ frase: sql<string>`min(${frase})`, n: count() })
    .from(activities)
    .innerJoin(targets, eq(activities.targetId, targets.id))
    .where(and(eq(targets.campaignId, campaignId), sql`nullif(trim(${activities.stalledAt}), '') is not null`))
    .groupBy(sql`lower(${frase})`)
    .orderBy(desc(count()))
    .limit(30);

  return { perdas, objecoes, frases };
}

// ---------------------------------------------------------------- e-mail

export async function getEmailTemplates() {
  const db = getDb();
  return db.select().from(emailTemplates).orderBy(asc(emailTemplates.name));
}

export type EmailTemplate = Awaited<ReturnType<typeof getEmailTemplates>>[number];

export type FilaItem = Awaited<ReturnType<typeof getOrphans>>[number];
export type QueueItem = Awaited<ReturnType<typeof getQueue>>[number];
export type TargetDetail = NonNullable<Awaited<ReturnType<typeof getTargetDetail>>>;
export type { Stage };
