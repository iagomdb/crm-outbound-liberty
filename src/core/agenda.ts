/** Agrupa os retornos agendados por proximidade (fuso do servidor = America/Sao_Paulo). */
export type Bucket = "atrasada" | "hoje" | "amanha" | "semana" | "depois";

export function bucketFor(due: Date, now: Date = new Date()): Bucket {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startDayAfter = new Date(startTomorrow);
  startDayAfter.setDate(startDayAfter.getDate() + 1);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  if (due < startToday) return "atrasada";
  if (due < startTomorrow) return "hoje";
  if (due < startDayAfter) return "amanha";
  if (due < endWeek) return "semana";
  return "depois";
}

export const BUCKET_ORDER: Bucket[] = ["atrasada", "hoje", "amanha", "semana", "depois"];

export const BUCKET_LABELS: Record<Bucket, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Esta semana",
  depois: "Depois",
};

export const BUCKET_CLASSES: Record<Bucket, string> = {
  atrasada: "text-red-600 dark:text-red-400",
  hoje: "text-emerald-600 dark:text-emerald-400",
  amanha: "text-sky-600 dark:text-sky-400",
  semana: "text-zinc-600 dark:text-zinc-300",
  depois: "text-zinc-400",
};
