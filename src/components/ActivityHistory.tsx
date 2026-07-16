import type { ReactNode } from "react";
import type { TargetDetail } from "@/db/queries";
import { OBJECTION_LABELS, OBJECTIVE_LABELS, ROLE_LABELS } from "@/core/pipeline";
import { fmtDateTime } from "@/lib/format";

type Activity = TargetDetail["activities"][number];

const lbl = "text-xs text-zinc-500";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={lbl}>{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Histórico de ligações: resumo em uma linha, clique expande o registro
 * completo (resultado, travou em, objeção, hipótese, notas, task gerada).
 * <details> nativo — funciona em server component, sem JS.
 */
export function ActivityHistory({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-zinc-500">Sem ligações registradas.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
      {activities.map((a) => (
        <li key={a.id}>
          <details className="group">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 py-2 text-xs [&::-webkit-details-marker]:hidden">
              <span className="text-zinc-300 transition-transform group-open:rotate-90 dark:text-zinc-600">▶</span>
              <span className="text-zinc-400">{fmtDateTime(a.occurredAt)}</span>
              {a.reachedHuman ? (
                <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">conversa</span>
              ) : (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800">discada</span>
              )}
              {a.objectiveHit !== "nenhum" && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {OBJECTIVE_LABELS[a.objectiveHit]}
                </span>
              )}
              {a.objection !== "nenhuma" && (
                <span className="text-orange-600 dark:text-orange-400">obj: {OBJECTION_LABELS[a.objection] ?? a.objection}</span>
              )}
              {a.outcome && <span className="min-w-0 flex-1 truncate text-zinc-500">{a.outcome}</span>}
            </summary>

            <dl className="mb-3 ml-5 grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-3 dark:bg-zinc-900">
              <Field label="Tipo">
                {a.type}
                {a.goldenHour ? " · 🔥 golden hour" : ""}
              </Field>
              <Field label="Falou com">
                {a.reachedHuman
                  ? a.contact
                    ? `${a.contact.nome || "sem nome"} (${ROLE_LABELS[a.contact.papel] ?? a.contact.papel})`
                    : "humano (contato não identificado)"
                  : "ninguém — não atendeu / não passou"}
              </Field>
              <Field label="Objetivo batido">{a.objectiveHit === "nenhum" ? "—" : OBJECTIVE_LABELS[a.objectiveHit]}</Field>
              {a.outcome && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className={lbl}>Resultado</dt>
                  <dd className="text-sm">{a.outcome}</dd>
                </div>
              )}
              {a.stalledAt && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className={lbl}>Travou em (retomar daqui)</dt>
                  <dd className="text-sm font-medium">“{a.stalledAt}”</dd>
                </div>
              )}
              {a.objection !== "nenhuma" && (
                <Field label="Objeção">
                  {OBJECTION_LABELS[a.objection] ?? a.objection}
                  {a.objectionIsReflexo ? " (reflexo, não real)" : ""}
                </Field>
              )}
              {a.hypothesisLanded != null && (
                <Field label="Hipótese">{a.hypothesisLanded ? "aterrissou ✓" : "não aterrissou"}</Field>
              )}
              {(a.nextActionAt || a.nextActionPretext) && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className={lbl}>Task gerada (regra de ouro)</dt>
                  <dd className="text-sm">
                    {a.nextActionAt ? fmtDateTime(a.nextActionAt) : "sem data"}
                    {a.nextActionPretext ? ` — “${a.nextActionPretext}”` : ""}
                  </dd>
                </div>
              )}
              {a.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className={lbl}>Notas</dt>
                  <dd className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{a.notes}</dd>
                </div>
              )}
            </dl>
          </details>
        </li>
      ))}
    </ul>
  );
}
