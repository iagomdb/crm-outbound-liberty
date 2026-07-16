import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getTriagemQueue } from "@/db/queries";
import { triageCompany } from "./actions";
import { fmtCnpj, fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
const td = "px-3 py-2 align-top";

export default async function TriagemPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const pending = await getTriagemQueue(campaign.id);

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
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={th}>Empresa</th>
                <th className={th}>CNAE principal</th>
                <th className={th}>Porte</th>
                <th className={th}>Capital social</th>
                <th className={th}>UF</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {pending.map((c) => (
                <tr key={c.targetId}>
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
                      <form action={triageCompany.bind(null, c.companyId, c.targetId, true)}>
                        <button className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                          fit
                        </button>
                      </form>
                      <form action={triageCompany.bind(null, c.companyId, c.targetId, false)}>
                        <button className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                          fora do ICP
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
