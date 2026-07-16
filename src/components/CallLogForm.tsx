"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Input, Select, Textarea, labelClasses } from "@/components/ui";

type Opt = { value: string; label: string };
type Contact = { id: string; nome: string | null; papel: string };

function SubmitButton({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Registrando…" : label ?? "Registrar ligação"}
    </Button>
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
  // fim de ciclo ⇒ o servidor LIMPA a task (regra de ouro) — esconder os campos
  // de próxima ação pra tela não sugerir que um retorno será agendado
  const isCycleEnd = stage === "ganho" || stage === "perdido" || stage === "handoff";
  const isNaoAgora = stage === "nao_agora";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        <input type="checkbox" name="reachedHuman" className="h-4 w-4" />
        <span className="text-sm font-medium">Falou com humano? (conta como conversa)</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <div className={labelClasses}>Resultado (1 linha)</div>
          <Input name="outcome" placeholder="o que aconteceu" />
        </div>

        <div className="col-span-2">
          <div className={labelClasses}>Onde travou? (a frase exata onde esfriou)</div>
          <Input name="stalledAt" placeholder='ex: "manda um e-mail"' />
        </div>

        <div>
          <div className={labelClasses}>Objeção</div>
          <Select name="objection" defaultValue="nenhuma">
            {objectionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className={labelClasses}>Objetivo batido</div>
          <Select name="objectiveHit" defaultValue="nenhum">
            {objectiveOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <div className={labelClasses}>Estado mental</div>
          <Select name="mentalState" defaultValue="">
            <option value="">(não mexer)</option>
            {mentalOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className={labelClasses}>Com quem falou</div>
          <Select name="contactId" defaultValue="">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome || "sem nome"} ({roleLabels[c.papel] ?? c.papel})
              </option>
            ))}
          </Select>
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
        <div className="col-span-2">
          <div className={labelClasses}>Estágio (deixe automático, ou force)</div>
          <Select name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">(automático — pelo resultado)</option>
            {stageOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {!isCycleEnd && (
          <>
            <div>
              <div className={labelClasses}>Próxima ação (quando)</div>
              <Input
                key={isNaoAgora ? "reentrada" : "cadencia"}
                type="datetime-local"
                name="nextActionAt"
                defaultValue={isNaoAgora ? undefined : defaultNextActionAt}
              />
              <p className="mt-0.5 text-[10px] text-zinc-400">
                {isNaoAgora ? "vazio ⇒ retoma em +90 dias" : "vazio ⇒ +2 dias úteis (regra de ouro)"}
              </p>
            </div>
            <div>
              <div className={labelClasses}>Tipo</div>
              <Select name="type" defaultValue="ligacao">
                {typeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <div className={labelClasses}>Pretexto do próximo contato (motivo novo — cadência teimosa)</div>
              <Input
                name="nextActionPretext"
                placeholder={isNaoAgora ? "vazio ⇒ “retomar — disse só ano que vem”" : "ex: mandar resumo de 1 página"}
              />
            </div>
          </>
        )}
        {isCycleEnd && (
          <p className="col-span-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Fim de ciclo — nenhum retorno será agendado; o lead sai da fila e vai pro “fora do ciclo”.
          </p>
        )}
        {isNaoAgora && (
          <p className="col-span-2 text-xs text-orange-600 dark:text-orange-400">
            “Não agora” reentra no ciclo: sem data, agenda retomada em +90 dias.
          </p>
        )}
        {stage === "perdido" && (
          <div className="col-span-2">
            <div className={labelClasses}>Motivo da perda (obrigatório — fim de ciclo)</div>
            <Input name="lostReason" required placeholder="ex: decisor recusou — já tem escritório" />
          </div>
        )}
        <div className="col-span-2">
          <div className={labelClasses}>Observações</div>
          <Textarea name="notes" rows={2} />
        </div>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
