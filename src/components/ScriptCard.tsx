import Link from "next/link";
import { Markdown } from "./Markdown";

// Script/pitch da carteira sempre à mão nas telas de ligação (fila e target) —
// acaba com o "CRM de um lado, script no editor do outro".

export function ScriptCard({
  script,
  campaignName,
  campaignSlug,
  defaultOpen = false,
  panel = false,
}: {
  script: string | null;
  campaignName: string;
  campaignSlug: string | null;
  defaultOpen?: boolean;
  /** painel fixo (coluna própria, sempre aberto, scroll interno) em vez de card recolhível */
  panel?: boolean;
}) {
  if (!script) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-xs text-zinc-400 dark:border-zinc-700">
        Esta carteira ainda não tem script.{" "}
        {campaignSlug && (
          <Link href={`/campaigns/${campaignSlug}/editar`} className="text-sky-600 hover:underline dark:text-sky-400">
            definir script →
          </Link>
        )}
      </div>
    );
  }

  if (panel) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold dark:border-zinc-900">
          📜 Script <span className="ml-1 font-normal text-zinc-400">{campaignName}</span>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5">
          <Markdown text={script} />
        </div>
      </div>
    );
  }

  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900">
        📜 Script da carteira <span className="ml-1 font-normal text-zinc-400">{campaignName}</span>
      </summary>
      <div className="max-h-[75vh] overflow-y-auto border-t border-zinc-100 p-5 dark:border-zinc-900">
        <Markdown text={script} />
      </div>
    </details>
  );
}
