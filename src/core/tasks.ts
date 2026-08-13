/**
 * A REGRA DE OURO do ciclo (docs/roadmap-ciclo-v1.md, Fase 2): nenhum lead sai
 * do ciclo sem decisão explícita. A "task" é o par nextActionAt+nextActionPretext
 * no target — registro de ligação em estágio não-terminal SEMPRE gera task.
 */
import type { Stage } from "./pipeline";

/** Estágios que encerram o ciclo (task limpa). `nao_agora` é o único que reentra. */
export const CYCLE_END_STAGES: Stage[] = ["ganho", "perdido", "nao_agora", "handoff"];

export const isCycleEnd = (s: Stage) => CYCLE_END_STAGES.includes(s);

/**
 * Cadência de quem não atende: reagenda em 7 e depois em 14 dias corridos.
 * Cadência curta fazia refazer a mesma lista em vez de abrir mercado novo;
 * espaçar libera o dia. A escada conta tentativas SEGUIDAS sem atender e ZERA
 * ao falar com humano.
 */
export const NO_ANSWER_LADDER_DAYS = [7, 14] as const;

/**
 * Fim da linha: 3 tentativas seguidas sem NINGUÉM atender e o lead morre — a
 * 3ª não reagenda. Levar "não" de quem atende é normal; perseguir quem não
 * existe mais (e ser cobrado por isso) é desperdício de dia.
 */
export const NO_ANSWER_MAX_STREAK = 3;
export const NO_ANSWER_DEAD_REASON = "3 tentativas sem atender — linha morta";

/**
 * Dias até a próxima tentativa. `streak` é a contagem JÁ INCLUINDO a ligação
 * que acabou de falhar: 1 ⇒ +7d, 2 ⇒ +14d, 3+ ⇒ null (morreu, não reagenda).
 * Passar 0 (nenhuma falha ainda) devolve o primeiro degrau, que é o default
 * mostrado no formulário antes de registrar.
 */
export function noAnswerDelayDays(streak: number): number | null {
  if (streak >= NO_ANSWER_MAX_STREAK) return null; // 3ª falha: morre
  return NO_ANSWER_LADDER_DAYS[Math.max(0, streak - 1)] ?? NO_ANSWER_LADDER_DAYS[0];
}

/** Soma N dias corridos e cai às 9h — começo da golden hour da manhã. */
export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

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

export type ResolvedTask = {
  nextActionAt: Date | null;
  nextActionPretext: string | null;
  /** true = escada de "não atende" esgotada; o chamador mata o lead. */
  noAnswerExhausted: boolean;
};

/**
 * Aplica a regra de ouro ao resultado de uma ligação:
 *  - estágio não-terminal ⇒ task obrigatória (defaulta pela escada 7/14);
 *  - terminal ⇒ fim de ciclo explícito (task limpa);
 *  - `nao_agora` ⇒ reentra com task longa (+90 dias);
 *  - escada esgotada e data não escolhida à mão ⇒ sinaliza morte da linha.
 *
 * `noAnswerStreak` é a contagem JÁ INCLUINDO esta ligação (1 = primeira sem
 * atender ⇒ +7d). Data escolhida à mão sempre vence a escada.
 */
export function resolveTask(
  stage: Stage,
  input: {
    nextActionAt: Date | null;
    nextActionPretext: string | null;
    noAnswerStreak?: number;
  },
  now: Date,
): ResolvedTask {
  if (stage === "nao_agora") {
    const at = input.nextActionAt ?? new Date(new Date(now).setDate(now.getDate() + NAO_AGORA_REENTRY_DAYS));
    return {
      nextActionAt: at,
      nextActionPretext: input.nextActionPretext ?? NAO_AGORA_PRETEXT,
      noAnswerExhausted: false,
    };
  }
  if (isCycleEnd(stage)) return { nextActionAt: null, nextActionPretext: null, noAnswerExhausted: false };

  // data escolhida à mão manda — "me liga daqui 1h" é exceção, não regra
  if (input.nextActionAt) {
    return { nextActionAt: input.nextActionAt, nextActionPretext: input.nextActionPretext, noAnswerExhausted: false };
  }

  const delay = noAnswerDelayDays(input.noAnswerStreak ?? 0);
  if (delay === null) {
    return { nextActionAt: null, nextActionPretext: null, noAnswerExhausted: true };
  }
  return {
    nextActionAt: addDays(now, delay),
    nextActionPretext: input.nextActionPretext,
    noAnswerExhausted: false,
  };
}

/** Valor pro <input type="datetime-local"> no fuso do servidor (America/Sao_Paulo). */
export function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
