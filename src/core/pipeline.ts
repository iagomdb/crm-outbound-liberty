import { targetStage, objectiveHit } from "../db/schema";

export type Stage = (typeof targetStage.enumValues)[number];
export type ObjectiveHit = (typeof objectiveHit.enumValues)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  novo: "Novo",
  tentando: "Tentando",
  conversa: "Conversa",
  qualificado: "Qualificado",
  reuniao_agendada: "Reunião agendada",
  handoff: "Handoff",
  ganho: "Ganho",
  perdido: "Perdido",
  nao_agora: "Não agora",
};

/** Ordem do funil, do topo ao fundo. */
export const STAGE_ORDER: Stage[] = [
  "novo",
  "tentando",
  "conversa",
  "qualificado",
  "reuniao_agendada",
  "handoff",
  "ganho",
  "perdido",
  "nao_agora",
];

/** Estágios que ainda pedem ação (entram na fila de ligação). */
export const ACTIVE_STAGES: Stage[] = [
  "novo",
  "tentando",
  "conversa",
  "qualificado",
  "reuniao_agendada",
  "handoff",
  "nao_agora",
];

export const TERMINAL_STAGES: Stage[] = ["ganho", "perdido"];

export const STAGE_CLASSES: Record<Stage, string> = {
  novo: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  tentando: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  conversa: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  qualificado: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  reuniao_agendada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  handoff: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  ganho: "bg-green-600 text-white",
  perdido: "bg-zinc-200 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  nao_agora: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

/**
 * Sugere o próximo estágio a partir do resultado da ligação — encoda o funil.
 * O objetivo #1 (reunião) manda; senão qualificado; senão pelo menos "conversa"
 * se falou com humano; senão "tentando".
 */
export function suggestStage(
  current: Stage,
  o: { reachedHuman: boolean; objectiveHit: ObjectiveHit; qualified: boolean },
): Stage {
  if (o.objectiveHit === "reuniao") return "reuniao_agendada";
  if (o.qualified) return "qualificado";
  if (o.reachedHuman) return current === "novo" || current === "tentando" ? "conversa" : current;
  return current === "novo" ? "tentando" : current;
}

// -------------------------------------------------- rótulos pras telas
export const OBJECTIVE_LABELS: Record<ObjectiveHit, string> = {
  nenhum: "Nenhum",
  reuniao: "Reunião agendada",
  email_nominal: "E-mail nominal",
};

export const OBJECTION_LABELS: Record<string, string> = {
  nenhuma: "Nenhuma",
  ja_temos: "Já temos / já resolvemos",
  manda_email: "Manda um e-mail",
  quanto_custa: "Quanto custa? (sinal de compra)",
  sem_caso: "Não tenho caso assim",
  so_ano_que_vem: "Só ano que vem",
  sem_tempo: "Sem tempo",
  outra: "Outra",
};

/** O qualificador real do playbook. */
export const MENTAL_LABELS: Record<string, string> = {
  desconhecido: "Desconhecido",
  ainda_negocia: "Ainda negocia (acha que vai receber)",
  ja_deu_como_perdido: "Já deu como perdido (o sim)",
};

export const ROLE_LABELS: Record<string, string> = {
  atendente: "Atendente",
  analista: "Analista",
  decisor: "Decisor",
  desconhecido: "?",
};
