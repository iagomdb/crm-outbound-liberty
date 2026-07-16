import { Card, Input, Textarea, Select, Field, Button } from "@/components/ui";
import { archiveTargetDetail, updateTarget } from "../crud-actions";

type Opt = { value: string; label: string };

type Props = {
  targetId: string;
  stage: string;
  mentalState: string;
  valorEstimado: string | number | null;
  nextActionPretext: string | null;
  notes: string | null;
  archived: boolean;
  stageOptions: Opt[];
  mentalOptions: Opt[];
};

export function TargetSection({
  targetId,
  stage,
  mentalState,
  valorEstimado,
  nextActionPretext,
  notes,
  archived,
  stageOptions,
  mentalOptions,
}: Props) {
  return (
    <Card title="Alvo">
      <form action={updateTarget.bind(null, targetId)} className="grid grid-cols-2 gap-2">
        <Field label="Estágio">
          <Select name="stage" defaultValue={stage}>
            {stageOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado mental">
          <Select name="mentalState" defaultValue={mentalState}>
            {mentalOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Próxima ação">
          <Input type="datetime-local" name="nextActionAt" />
        </Field>
        <Field label="Valor estimado (perda)">
          <Input type="number" step="0.01" name="valorEstimado" defaultValue={valorEstimado ?? ""} />
        </Field>
        <Field label="Pretexto do próximo contato" className="col-span-2">
          <Input name="nextActionPretext" defaultValue={nextActionPretext ?? ""} />
        </Field>
        <Field label="Observações" className="col-span-2">
          <Textarea name="notes" defaultValue={notes ?? ""} rows={2} />
        </Field>
        <Button type="submit" className="col-span-2 justify-self-start">
          Salvar alvo
        </Button>
      </form>
      {!archived && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-red-500 hover:underline">arquivar lead</summary>
          <form action={archiveTargetDetail.bind(null, targetId)} className="mt-2 flex gap-2">
            <Input name="reason" placeholder="motivo (ex: sem caso, morreu)" />
            <Button type="submit" variant="danger">
              Arquivar
            </Button>
          </form>
        </details>
      )}
    </Card>
  );
}
