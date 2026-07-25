import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { Field, fieldClasses } from "@/components/ui";
import { PendingButton } from "@/components/PendingButton";
import { uploadSheet } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireUser();
  const { err } = await searchParams;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href="/" className="text-xs text-zinc-400 hover:underline">
          ← voltar
        </Link>
        <h1 className="text-xl font-semibold">Importar leads</h1>
        <p className="text-sm text-zinc-500">
          Envie uma ou mais planilhas .xlsx com linha de cabeçalho (ex.: CNPJ, Razão Social… ou scraps do Maps).
          Vários arquivos da mesma estrutura entram juntos: você mapeia as colunas uma vez (pelo primeiro) e o
          sistema aplica nos demais pelo nome do cabeçalho.
        </p>
      </div>

      {err && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {err}
        </p>
      )}

      <form
        action={uploadSheet}
        className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <Field label="Planilhas (.xlsx) — pode selecionar várias">
          <input type="file" name="file" accept=".xlsx" multiple required className={fieldClasses} />
        </Field>
        <PendingButton pendingText="Enviando e analisando…" className="self-start">
          Analisar planilha
        </PendingButton>
      </form>
    </div>
  );
}
