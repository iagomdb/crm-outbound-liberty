/**
 * A REGRA DE OURO do ciclo (docs/roadmap-ciclo-v1.md, Fase 2): nenhum lead sai
 * do ciclo sem decisão explícita. A "task" é o par nextActionAt+nextActionPretext
 * no target — registro de ligação em estágio não-terminal SEMPRE gera task.
 */
import type { Stage } from "./pipeline";

/** Estágios que encerram o ciclo (task limpa). `nao_agora` é o único que reentra. */
export const CYCLE_END_STAGES: Stage[] = ["ganho", "perdido", "nao_agora", "handoff"];

export const isCycleEnd = (s: Stage) => CYCLE_END_STAGES.includes(s);

/** Cadência do playbook: follow-up padrão em +2 dias úteis. */
export const DEFAULT_FOLLOWUP_BUSINESS_DAYS = 2;

/** Reentrada do "não agora": task longa. */
export const NAO_AGORA_REENTRY_DAYS = 90;
export const NAO_AGORA_PRETEXT = "retomar — disse só ano que vem";

/** Soma N dias úteis (pula sáb/dom) e cai às 9h — começo da golden hour da manhã. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

export type ResolvedTask = { nextActionAt: Date | null; nextActionPretext: string | null };

/**
 * Aplica a regra de ouro ao resultado de uma ligação:
 *  - estágio não-terminal ⇒ task obrigatória (defaulta +2 dias úteis);
 *  - terminal ⇒ fim de ciclo explícito (task limpa);
 *  - `nao_agora` ⇒ reentra com task longa (+90 dias).
 */
export function resolveTask(
  stage: Stage,
  input: { nextActionAt: Date | null; nextActionPretext: string | null },
  now: Date,
): ResolvedTask {
  if (stage === "nao_agora") {
    const at = input.nextActionAt ?? new Date(new Date(now).setDate(now.getDate() + NAO_AGORA_REENTRY_DAYS));
    return { nextActionAt: at, nextActionPretext: input.nextActionPretext ?? NAO_AGORA_PRETEXT };
  }
  if (isCycleEnd(stage)) return { nextActionAt: null, nextActionPretext: null };
  return {
    nextActionAt: input.nextActionAt ?? addBusinessDays(now, DEFAULT_FOLLOWUP_BUSINESS_DAYS),
    nextActionPretext: input.nextActionPretext,
  };
}

/** Valor pro <input type="datetime-local"> no fuso do servidor (America/Sao_Paulo). */
export function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
