import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getTriagemQueue } from "@/db/queries";
import { bulkDelete, bulkDeleteAllPending, bulkTriage, triageCompany } from "./actions";
import { fmtCnpj, fmtMoney } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SelectAllCheckbox } from "@/components/SelectAllCheckbox";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
const td = "px-3 py-2 align-top";
const PAGE_SIZE = 100;

export default async function TriagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  await requireUser();
  const [{ slug }, { p }] = await Promise.all([params, searchParams]);
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const pending = await getTriagemQueue(campaign.id);

  // paginação de 100 (a seleção em massa age sobre a página visível)
  const totalPages = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(p) || 1));
  const start = (page - 1) * PAGE_SIZE;
  const visible = pending.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Triagem de ICP</h1>
        <p className="text-sm text-zinc-500">
          {pending.length} empresas sem decisão. ICP: {campaign.icp || "médio indústria/distribuidora B2B"} — fora
          disso é tempo perdido, e a decisão fica gravada (não retriar).
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Tudo triado. Os fits estão na <Link href="/fila" className="text-sky-600 hover:underline dark:text-sky-400">Fila do Dia</Link> como estado zero.
        </p>
      ) : (
        <form className="flex flex-col gap-3">
          {/* barra de ações em massa — age sobre os selecionados */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="text-xs text-zinc-500">com os selecionados:</span>
            <Button type="submit" formAction={bulkTriage.bind(null, slug, true)} variant="success" size="sm">
              fit
            </Button>
            <Button type="submit" formAction={bulkTriage.bind(null, slug, false)} variant="secondary" size="sm">
              fora do ICP
            </Button>
            <ConfirmButton
              formAction={bulkDelete.bind(null, slug)}
              message="Apagar da carteira os alvos SELECIONADOS? As empresas continuam cadastradas no CRM. Não tem volta."
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              apagar da carteira
            </ConfirmButton>
            <span className="ml-auto">
              <ConfirmButton
                formAction={bulkDeleteAllPending.bind(null, slug)}
                message={`Apagar TODOS os ${pending.length} pendentes de triagem desta carteira (todas as páginas)? Use pra desfazer uma importação errada. As empresas continuam no CRM. Não tem volta.`}
                className="rounded-md px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              >
                apagar TODOS os {pending.length} pendentes
              </ConfirmButton>
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className={`${th} w-8`}>
                    <SelectAllCheckbox />
                  </th>
                  <th className={th}>Empresa</th>
                  <th className={th}>CNAE principal</th>
                  <th className={th}>Porte</th>
                  <th className={th}>Capital social</th>
                  <th className={th}>UF</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {visible.map((c) => (
                  <tr key={c.targetId}>
                    <td className={td}>
                      <input
                        type="checkbox"
                        name="sel"
                        value={`${c.targetId}:${c.companyId}`}
                        className="size-4 accent-zinc-900 dark:accent-white"
                      />
                    </td>
                    <td className={td}>
                      <Link href={`/targets/${c.targetId}`} className="font-medium hover:underline">
                        {c.nomeFantasia || c.razaoSocial}
                      </Link>
                      <div className="text-xs text-zinc-400">{fmtCnpj(c.cnpj)}</div>
                    </td>
                    <td className={`${td} max-w-xs text-xs text-zinc-600 dark:text-zinc-300`}>{c.cnaePrincipal || "—"}</td>
                    <td className={td}>{c.porte || "—"}</td>
                    <td className={`${td} tabular-nums`}>{fmtMoney(c.capitalSocial)}</td>
                    <td className={td}>{[c.municipio, c.uf].filter(Boolean).join(" - ") || "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex gap-1.5">
                        <Button
                          type="submit"
                          formAction={triageCompany.bind(null, c.companyId, c.targetId, true)}
                          variant="success"
                          size="sm"
                        >
                          fit
                        </Button>
                        <Button
                          type="submit"
                          formAction={triageCompany.bind(null, c.companyId, c.targetId, false)}
                          variant="secondary"
                          size="sm"
                        >
                          fora do ICP
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span className="tabular-nums">
                mostrando {start + 1}–{start + visible.length} de {pending.length}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <ButtonLink href={`/campaigns/${slug}/triagem?p=${page - 1}`} variant="secondary" size="sm">
                    ← anteriores
                  </ButtonLink>
                )}
                <span className="tabular-nums text-xs">
                  página {page}/{totalPages}
                </span>
                {page < totalPages && (
                  <ButtonLink href={`/campaigns/${slug}/triagem?p=${page + 1}`} variant="secondary" size="sm">
                    próximas →
                  </ButtonLink>
                )}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
