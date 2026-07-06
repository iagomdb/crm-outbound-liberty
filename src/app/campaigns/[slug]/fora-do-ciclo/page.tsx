import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignBySlug, getForaDoCiclo } from "@/db/queries";
import { StageBadge } from "@/components/StageBadge";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
const td = "px-3 py-2 align-top";

/**
 * Fins de ciclo (roadmap Fase 4): todo lead que saiu termina aqui, com motivo
 * e data — pra revisar se o funil está vazando por razão errada.
 */
export default async function ForaDoCicloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const rows = await getForaDoCiclo(campaign.id);

  const fimDe = (t: (typeof rows)[number]) => {
    if (t.archivedAt) return { label: "arquivado", reason: t.archiveReason, when: t.archivedAt };
    if (t.stage === "perdido") return { label: "perdido", reason: t.lostReason, when: t.stageChangedAt };
    if (t.stage === "nao_agora")
      return {
        label: "não agora",
        reason: t.nextActionAt ? `reentra ${fmtDate(t.nextActionAt)} — ${t.nextActionPretext ?? ""}` : "SEM task de reentrada!",
        when: t.stageChangedAt,
      };
    return { label: t.stage, reason: null, when: t.stageChangedAt };
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Fora do ciclo</h1>
        <p className="text-sm text-zinc-500">
          {rows.length} leads encerrados — ganho, perdido, não agora, arquivado. Nada evapora sem motivo.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Nenhum lead fora do ciclo ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={th}>Empresa</th>
                <th className={th}>Fim</th>
                <th className={th}>Motivo</th>
                <th className={th}>Quando</th>
                <th className={th}>Tent.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.map((t) => {
                const fim = fimDe(t);
                return (
                  <tr key={t.id}>
                    <td className={td}>
                      <Link href={`/targets/${t.id}`} className="font-medium hover:underline">
                        {t.nomeFantasia || t.razaoSocial}
                      </Link>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <StageBadge stage={t.stage} />
                        {t.archivedAt && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                            arquivado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${td} max-w-sm text-xs text-zinc-600 dark:text-zinc-300`}>{fim.reason || "—"}</td>
                    <td className={`${td} whitespace-nowrap text-xs text-zinc-400`}>{fmtDateTime(fim.when)}</td>
                    <td className={`${td} tabular-nums text-zinc-500`}>{t.attempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
