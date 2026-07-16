import { Card, Input, Field, Button } from "@/components/ui";
import { scheduleReturn } from "@/app/agenda/actions";
import { fmtDateTime } from "@/lib/format";

type Props = {
  targetId: string;
  nextActionAt: Date | null;
  nextActionPretext: string | null;
};

export function ScheduleReturnSection({ targetId, nextActionAt, nextActionPretext }: Props) {
  return (
    <Card title="⏰ Agendar retorno">
      <form action={scheduleReturn.bind(null, targetId)} className="flex flex-wrap items-end gap-2">
        <Field label="Voltar em">
          <Input type="datetime-local" name="dueAt" />
        </Field>
        <Field label="Pretexto novo" className="min-w-40 flex-1">
          <Input name="pretext" defaultValue={nextActionPretext ?? ""} placeholder="motivo do retorno" />
        </Field>
        <Button type="submit">Agendar</Button>
      </form>
      {nextActionAt && (
        <p className="mt-2 text-xs text-zinc-500">
          Atual: {fmtDateTime(nextActionAt)}
          {nextActionPretext ? ` — ${nextActionPretext}` : ""}
        </p>
      )}
    </Card>
  );
}
