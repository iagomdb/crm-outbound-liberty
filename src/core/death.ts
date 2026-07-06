/**
 * "Estimativa de morte" de um lead. Combo do playbook: um lead morre por
 * EXCESSO DE TENTATIVAS sem avançar (o sim vem até ~8º contato) OU por ficar
 * PARADO tempo demais no mesmo estágio — o que vier primeiro.
 */
export const DEATH_ATTEMPT_LIMIT = 8; // playbook: maioria dos sins entre 5º-8º contato
export const DEATH_STALL_DAYS = 21; // ~3 semanas parado no mesmo estágio = morto

export type DeathState = "ok" | "morrendo" | "morto";

export type Death = {
  score: number; // 0..1
  state: DeathState;
  attempts: number;
  attemptsLeft: number;
  daysStalled: number;
  daysLeft: number;
  nearest: "tentativas" | "tempo";
};

export function deathFor(input: {
  attempts: number;
  stageChangedAt: Date | string;
  now?: Date;
}): Death {
  const now = input.now ?? new Date();
  const changed =
    typeof input.stageChangedAt === "string" ? new Date(input.stageChangedAt) : input.stageChangedAt;
  const daysStalled = Math.max(0, Math.floor((now.getTime() - changed.getTime()) / 86_400_000));
  const attempts = input.attempts;

  const fromAttempts = attempts / DEATH_ATTEMPT_LIMIT;
  const fromTime = daysStalled / DEATH_STALL_DAYS;
  const score = Math.min(1, Math.max(fromAttempts, fromTime));

  return {
    score,
    state: score >= 1 ? "morto" : score >= 0.7 ? "morrendo" : "ok",
    attempts,
    attemptsLeft: Math.max(0, DEATH_ATTEMPT_LIMIT - attempts),
    daysStalled,
    daysLeft: Math.max(0, DEATH_STALL_DAYS - daysStalled),
    nearest: fromAttempts >= fromTime ? "tentativas" : "tempo",
  };
}

/** Rótulo curto de estimativa pro card. */
export function deathLabel(d: Death): string {
  if (d.state === "morto") return "morto — arquive";
  return d.nearest === "tentativas" ? `≈${d.attemptsLeft} tent.` : `≈${d.daysLeft}d`;
}

export const DEATH_CLASSES: Record<DeathState, { bar: string; text: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  morrendo: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  morto: { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};
