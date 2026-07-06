"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type Opt = { value: string; label: string };
type Contact = { id: string; nome: string | null; papel: string };

const field = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "text-xs font-medium text-zinc-500";

function SubmitButton({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Registrando…" : label ?? "Registrar ligação"}
    </button>
  );
}

export function CallLogForm({
  action,
  contacts,
  stageOptions,
  objectionOptions,
  objectiveOptions,
  mentalOptions,
  typeOptions,
  roleLabels,
  defaultNextActionAt,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  contacts: Contact[];
  stageOptions: Opt[];
  objectionOptions: Opt[];
  objectiveOptions: Opt[];
  mentalOptions: Opt[];
  typeOptions: Opt[];
  roleLabels: Record<string, string>;
  /** Sugestão da regra de ouro (+2 dias úteis), calculada no servidor. */
  defaultNextActionAt?: string;
  submitLabel?: string;
}) {
  const [stage, setStage] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        <input type="checkbox" name="reachedHuman" className="h-4 w-4" />
        <span className="text-sm font-medium">Falou com humano? (conta como conversa)</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <div className={label}>Resultado (1 linha)</div>
          <input name="outcome" className={field} placeholder="o que aconteceu" />
        </div>

        <div className="col-span-2">
          <div className={label}>Onde travou? (a frase exata onde esfriou)</div>
          <input name="stalledAt" className={field} placeholder='ex: "manda um e-mail"' />
        </div>

        <div>
          <div className={label}>Objeção</div>
          <select name="objection" className={field} defaultValue="nenhuma">
            {objectionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={label}>Objetivo batido</div>
          <select name="objectiveHit" className={field} defaultValue="nenhum">
            {objectiveOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className={label}>Estado mental</div>
          <select name="mentalState" className={field} defaultValue="">
            <option value="">(não mexer)</option>
            {mentalOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={label}>Com quem falou</div>
          <select name="contactId" className={field} defaultValue="">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome || "sem nome"} ({roleLabels[c.papel] ?? c.papel})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="objectionIsReflexo" className="h-4 w-4" /> reflexo?
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="hypothesisLanded" className="h-4 w-4" /> hipótese pegou?
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="qualified" className="h-4 w-4" /> qualificado?
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={label}>Próxima ação (quando)</div>
          <input type="datetime-local" name="nextActionAt" defaultValue={defaultNextActionAt} className={field} />
          <p className="mt-0.5 text-[10px] text-zinc-400">vazio ⇒ +2 dias úteis (regra de ouro)</p>
        </div>
        <div>
          <div className={label}>Tipo</div>
          <select name="type" className={field} defaultValue="ligacao">
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <div className={label}>Pretexto do próximo contato (motivo novo — cadência teimosa)</div>
          <input name="nextActionPretext" className={field} placeholder="ex: mandar resumo de 1 página" />
        </div>
        <div className="col-span-2">
          <div className={label}>Estágio (deixe automático, ou force)</div>
          <select name="stage" className={field} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">(automático — pelo resultado)</option>
            {stageOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {stage === "perdido" && (
          <div className="col-span-2">
            <div className={label}>Motivo da perda (obrigatório — fim de ciclo)</div>
            <input name="lostReason" required className={field} placeholder="ex: decisor recusou — já tem escritório" />
          </div>
        )}
        {stage === "nao_agora" && (
          <p className="col-span-2 text-xs text-orange-600 dark:text-orange-400">
            “Não agora” reentra no ciclo: sem data, agenda retomada em +90 dias.
          </p>
        )}
        <div className="col-span-2">
          <div className={label}>Observações</div>
          <textarea name="notes" rows={2} className={field} />
        </div>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
