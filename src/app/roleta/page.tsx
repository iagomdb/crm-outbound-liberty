import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getRoletaCampaigns } from "@/db/queries";
import { Button } from "@/components/ui";
import { sortear } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Randomizador de ligação: marca as carteiras, sorteia uma empresa em
 * "novo"/"fit" e vai discando aleatoriamente entre elas — bom pra testar
 * segmentos e abordagens diferentes na mesma sessão.
 */
export default async function RoletaPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireUser();
  const { err } = await searchParams;
  const camps = await getRoletaCampaigns();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href="/fila" className="text-xs text-zinc-400 hover:underline">
          ← fila do dia
        </Link>
        <h1 className="text-xl font-semibold">🎲 Roleta de empresas</h1>
        <p className="text-sm text-zinc-500">
          Marque as carteiras e sorteie por onde começar. Só entram empresas em <strong>novo</strong> ou{" "}
          <strong>fit</strong> — cada ligação registrada sorteia a próxima, misturando os segmentos marcados.
        </p>
      </div>

      {err && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {err}
        </p>
      )}

      <form
        action={sortear}
        className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        {camps.length === 0 && <p className="text-sm text-zinc-500">Nenhuma carteira ativa.</p>}
        {camps.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="c"
                value={c.slug ?? ""}
                disabled={c.disponiveis === 0}
                className="size-4 accent-zinc-900 dark:accent-white"
              />
              {c.name}
            </span>
            <span className={`text-xs tabular-nums ${c.disponiveis === 0 ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-500"}`}>
              {c.disponiveis} disponíveis
            </span>
          </label>
        ))}
        <Button type="submit" className="mt-3 self-start">
          🎲 Sortear e começar
        </Button>
      </form>
    </div>
  );
}
