import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { suggestStage, type ObjectiveHit, type Stage } from "./pipeline";
import { isGoldenHour } from "./golden-hours";
import { resolveTask } from "./tasks";

type DB = PostgresJsDatabase<typeof schema>;
type ActivityType = (typeof schema.activityType.enumValues)[number];
type ObjectionType = (typeof schema.objectionType.enumValues)[number];
type MentalStateT = (typeof schema.mentalState.enumValues)[number];
type IcpGradeT = (typeof schema.icpGrade.enumValues)[number];
type CobrancaT = (typeof schema.cobrancaType.enumValues)[number];
type FaixaClientesT = (typeof schema.faixaClientes.enumValues)[number];
type PortePercebidoT = (typeof schema.portePercebido.enumValues)[number];

export type CallInput = {
  reachedHuman: boolean;
  type: ActivityType;
  outcome: string | null;
  stalledAt: string | null;
  objection: ObjectionType;
  objectionIsReflexo: boolean | null;
  hypothesisLanded: boolean | null;
  objectiveHit: ObjectiveHit;
  qualified: boolean;
  contactId: string | null;
  mentalState: MentalStateT | null;
  stageOverride: Stage | null;
  nextActionAt: Date | null;
  nextActionPretext: string | null;
  lostReason: string | null;
  notes: string | null;
  // leitura de mercado (estatística de ICP) — tudo opcional, null = não avaliado
  abordagens: { itemId: string; categoria: string; opcao: string }[] | null;
  dorPercebida: number | null;
  icpGrade: IcpGradeT | null;
  tipoCobranca: CobrancaT | null;
  faixaClientes: FaixaClientesT | null;
  portePercebido: PortePercebidoT | null;
  now?: Date;
};

/**
 * Grava uma ligação: cria a atividade, avança o alvo pelo funil (a não ser que
 * o estágio seja forçado) e registra a reunião se o objetivo #1 foi batido.
 * Aplica a REGRA DE OURO (core/tasks.ts): estágio não-terminal ⇒ task
 * obrigatória; terminal ⇒ task limpa; `nao_agora` ⇒ reentra com task longa.
 * Função pura (recebe o db) — testável fora do Next.
 */
export async function recordCall(db: DB, targetId: string, input: CallInput) {
  const now = input.now ?? new Date();

  const [cur] = await db
    .select({ stage: schema.targets.stage, companyId: schema.targets.companyId })
    .from(schema.targets)
    .where(eq(schema.targets.id, targetId));

  const newStage: Stage =
    input.stageOverride ??
    suggestStage((cur?.stage ?? "novo") as Stage, {
      reachedHuman: input.reachedHuman,
      objectiveHit: input.objectiveHit,
      qualified: input.qualified,
    });
  const stageChanged = newStage !== (cur?.stage ?? "novo");

  const task = resolveTask(
    newStage,
    { nextActionAt: input.nextActionAt, nextActionPretext: input.nextActionPretext },
    now,
  );

  const [act] = await db
    .insert(schema.activities)
    .values({
      targetId,
      contactId: input.contactId,
      type: input.type,
      occurredAt: now,
      reachedHuman: input.reachedHuman,
      outcome: input.outcome,
      stalledAt: input.stalledAt,
      objection: input.objection,
      objectionIsReflexo: input.objectionIsReflexo,
      hypothesisLanded: input.hypothesisLanded,
      objectiveHit: input.objectiveHit,
      dorPercebida: input.dorPercebida,
      abordagens: input.abordagens,
      goldenHour: isGoldenHour(now),
      nextActionAt: task.nextActionAt,
      nextActionPretext: task.nextActionPretext,
      notes: input.notes,
    })
    .returning({ id: schema.activities.id });

  await db
    .update(schema.targets)
    .set({
      stage: newStage,
      lastContactAt: now,
      attempts: sql`${schema.targets.attempts} + 1`,
      nextActionAt: task.nextActionAt,
      nextActionPretext: task.nextActionPretext,
      updatedAt: now,
      ...(stageChanged ? { stageChangedAt: now, moves: sql`${schema.targets.moves} + 1` } : {}),
      ...(input.qualified ? { qualified: true } : {}),
      ...(input.objectiveHit === "email_nominal" ? { wonEmailNominal: true } : {}),
      ...(input.contactId ? { primaryContactId: input.contactId } : {}),
      ...(input.mentalState ? { mentalState: input.mentalState } : {}),
      ...(input.icpGrade ? { icpGrade: input.icpGrade } : {}),
      ...(newStage === "perdido" ? { lostReason: input.lostReason || "não informado" } : {}),
    })
    .where(eq(schema.targets.id, targetId));

  // fatos da empresa descobertos na conversa — só grava o que veio preenchido
  if (cur?.companyId && (input.tipoCobranca || input.faixaClientes || input.portePercebido)) {
    await db
      .update(schema.companies)
      .set({
        ...(input.tipoCobranca ? { tipoCobranca: input.tipoCobranca } : {}),
        ...(input.faixaClientes ? { faixaClientes: input.faixaClientes } : {}),
        ...(input.portePercebido ? { portePercebido: input.portePercebido } : {}),
        updatedAt: now,
      })
      .where(eq(schema.companies.id, cur.companyId));
  }

  if (input.objectiveHit === "reuniao" && input.nextActionAt) {
    await db
      .insert(schema.meetings)
      .values({ targetId, scheduledAt: input.nextActionAt, status: "agendada", activityId: act.id });
  }

  return { activityId: act.id, newStage, task };
}
