import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { asc } from "drizzle-orm";
import { campaigns } from "@/db/schema";
import { Badge, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { duplicarHipotese } from "./actions";

export const dynamic = "force-dynamic";

export default async function HipotesesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser();
  const { ok, err } = await searchParams;
  const db = getDb();

  const camps = await db.select().from(campaigns).orderBy(asc(campaigns.createdAt));
  const items = await db.query.checklistItems.findMany({ with: { opcoes: true } });

  const resumo = (campaignId: string) => {
    const mine = items.filter((i) => i.campaignId === campaignId);
    const categorias = mine.filter((i) => i.opcoes.length > 0).length;
    return { itens: mine.length, categorias };
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">🧪 Hipóteses (pitch + checklist por carteira)</h1>
        <p className="text-sm text-zinc-500">
          Cada carteira é uma hipótese de segmento: pitch + checklist próprios. Edite aqui num lugar só, ou duplique
          uma hipótese pronta pra outra carteira (cópia independente — sobrescreve o destino).
        </p>
      </div>

      {ok && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Hipótese duplicada.
        </p>
      )}
      {err && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {err}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {camps.map((c) => {
          const r = resumo(c.id);
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge tone={c.status === "ativa" ? "emerald" : "neutral"} pill>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {c.script ? `pitch: ${(c.script.length / 1000).toFixed(1)}k caracteres` : "sem pitch"} ·{" "}
                  {r.itens > 0
                    ? `checklist: ${r.itens} itens${r.categorias ? ` (${r.categorias} com variações)` : ""}`
                    : "sem checklist"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/campaigns/${c.slug}/editar`}
                  className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                >
                  editar →
                </Link>
                <form action={duplicarHipotese.bind(null, c.id)} className="flex items-center gap-1.5">
                  <Select name="toCampaignId" defaultValue="" className="text-xs">
                    <option value="">duplicar para…</option>
                    {camps
                      .filter((o) => o.id !== c.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </Select>
                  <ConfirmButton
                    message={`Copiar o pitch e o checklist de "${c.name}" pra carteira escolhida? O pitch/checklist atuais do destino serão SOBRESCRITOS.`}
                    className="whitespace-nowrap rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Duplicar
                  </ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
