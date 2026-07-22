import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getIcpRawData } from "@/db/queries";
import { OBJECTION_LABELS } from "@/core/pipeline";
import {
  HYPOTHESIS_UI,
  computeCampaignStats,
  computeEvolution,
  gradeFromAvg,
  topPhrases,
  type Evolution,
  type IcpCampaignStats,
} from "@/core/icp-stats";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
const td = "px-3 py-2 align-top tabular-nums";

const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const fmt1 = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
const fmt2 = (v: number | null) => (v == null ? "—" : v.toFixed(2).replace(".", ","));

const MEDALS = ["🥇", "🥈", "🥉"];

/** intensidade do heatmap: 0 → transparente, máximo → forte */
const heat = (n: number, max: number) => {
  if (n === 0 || max === 0) return undefined;
  const alpha = 0.15 + 0.55 * (n / max);
  return { backgroundColor: `rgba(239, 68, 68, ${alpha.toFixed(2)})` };
};

export default async function IcpPage() {
  await requireUser();
  const { camps, rawTargets, rawCalls, rawMeetings } = await getIcpRawData();

  const withData = camps.filter((c) => rawTargets.some((t) => t.campaignId === c.id));
  const stats = new Map<string, IcpCampaignStats>(
    withData.map((c) => [c.id, computeCampaignStats(c.id, rawTargets, rawCalls, rawMeetings)]),
  );
  const ranked = [...withData].sort(
    (a, b) => (stats.get(b.id)!.scoreMedio ?? -1) - (stats.get(a.id)!.scoreMedio ?? -1),
  );

  // heatmap de objeções: carteira × objeção (só ligações com objeção real)
  const objKeys = Object.keys(OBJECTION_LABELS).filter((k) => k !== "nenhuma");
  const objCount = (campaignId: string, obj: string) =>
    rawCalls.filter((c) => c.campaignId === campaignId && c.objection === obj).length;
  const objMax = Math.max(1, ...withData.flatMap((c) => objKeys.map((o) => objCount(c.id, o))));

  const phrases = topPhrases(rawCalls, 10);

  const evolutions: [string, Evolution][] = withData.map((c) => [
    c.id,
    computeEvolution(rawCalls.filter((r) => r.campaignId === c.id)),
  ]);

  const totalLigacoes = rawCalls.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">📊 Estatísticas de ICP</h1>
        <p className="text-sm text-zinc-500">
          {totalLigacoes} ligações viraram pontos de dado. Cada carteira é uma hipótese de segmento — aqui elas
          brigam entre si: dor real, acesso ao decisor, reunião marcada. Preencha a “Leitura de mercado” ao registrar
          ligações pra alimentar isso.
        </p>
      </div>

      {/* ranking por ICP Score */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ranked.map((c, i) => {
          const s = stats.get(c.id)!;
          const h = HYPOTHESIS_UI[s.hypothesis];
          return (
            <Link
              key={c.id}
              href={`/campaigns/${c.slug}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {MEDALS[i] ?? `${i + 1}º`} {c.name}
                </span>
                <Badge tone={s.hypothesis === "forte" ? "emerald" : s.hypothesis === "fraca" ? "orange" : "neutral"} pill>
                  {h.emoji} {h.label}
                </Badge>
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{fmt2(s.scoreMedio)}</div>
              <div className="text-xs text-zinc-400">
                ICP Score médio · {s.scoreTotal} pts / {s.ligadas} ligadas
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                dor {fmt1(s.dorMedia)} · ICP {s.icpMedio != null ? gradeFromAvg(s.icpMedio) : "—"} · {s.reunioes}{" "}
                reuniões
              </div>
            </Link>
          );
        })}
        {ranked.length === 0 && <p className="text-sm text-zinc-500">Nenhuma carteira com empresas ainda.</p>}
      </div>

      {/* métricas completas */}
      <Card title="Métricas por carteira">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={th}>Carteira</th>
                <th className={th}>Empresas</th>
                <th className={th}>Ligadas</th>
                <th className={th}>Falou humano</th>
                <th className={th}>Falou decisor</th>
                <th className={th} title="média do máximo por empresa, só avaliadas">Dor média</th>
                <th className={th}>ICP médio</th>
                <th className={th}>Reuniões</th>
                <th className={th}>Taxa reunião</th>
                <th className={th} title="% das avaliadas com dor ≥ 3">Crédito &gt;90d</th>
                <th className={th} title="% das que informaram como cobram">Usam escritório</th>
                <th className={th}>Score médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {ranked.map((c) => {
                const s = stats.get(c.id)!;
                return (
                  <tr key={c.id}>
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={td}>{s.empresas}</td>
                    <td className={td}>{s.ligadas}</td>
                    <td className={td}>{fmtPct(s.pctFalouHumano)}</td>
                    <td className={td}>{fmtPct(s.pctFalouDecisor)}</td>
                    <td className={td}>
                      {fmt1(s.dorMedia)}
                      {s.dorMedia != null && <span className="ml-1 text-xs text-zinc-400">({s.dorAvaliadas} aval.)</span>}
                    </td>
                    <td className={td}>
                      {s.icpMedio != null ? `${gradeFromAvg(s.icpMedio)} · ${fmt1(s.icpMedio)}/4` : "—"}
                    </td>
                    <td className={td}>{s.reunioes}</td>
                    <td className={td}>{fmtPct(s.taxaReuniao)}</td>
                    <td className={td}>{fmtPct(s.pctCredito90)}</td>
                    <td className={td}>{fmtPct(s.pctUsamEscritorio)}</td>
                    <td className={`${td} font-semibold`}>{fmt2(s.scoreMedio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Score: decisor 2 · dor 3 → 4 pts · dor 4 → 6 pts · ICP B → 2 · ICP A → 4 · tem escritório → 2 · reunião →
          10 · follow-up (≥2 ligações) → 2. Média sobre empresas ligadas.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* heatmap de objeções */}
        <Card title="Heatmap de objeções">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className={th}>Carteira</th>
                  {objKeys.map((o) => (
                    <th key={o} className={`${th} whitespace-nowrap`}>
                      {OBJECTION_LABELS[o as keyof typeof OBJECTION_LABELS] ?? o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {withData.map((c) => (
                  <tr key={c.id}>
                    <td className={`${td} font-medium`}>{c.name}</td>
                    {objKeys.map((o) => {
                      const n = objCount(c.id, o);
                      return (
                        <td key={o} className={`${td} text-center`} style={heat(n, objMax)}>
                          {n || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* frases onde morreu */}
        <Card title="Frases onde morreu (agrupadas)">
          {phrases.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma frase registrada ainda — preencha “Onde travou?” nas ligações.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {phrases.map((p) => (
                <li key={p.frase} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">“{p.frase}”</span>
                  <span className="font-semibold tabular-nums">{p.n}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* evolução: primeiras vs últimas N ligações */}
      <Card title="Evolução (primeiras vs últimas ligações)">
        <div className="flex flex-col gap-4">
          {evolutions.every(([, e]) => e == null) && (
            <p className="text-sm text-zinc-500">
              Aparece quando uma carteira passa de 40 ligações — compara as primeiras N com as últimas N pra separar
              “melhorei o script” de “mudei de segmento”.
            </p>
          )}
          {evolutions.map(([campaignId, evo]) => {
            if (!evo) return null;
            const c = withData.find((x) => x.id === campaignId)!;
            const delta = (a: number, b: number) => {
              const d = Math.round((b - a) * 100);
              return d === 0 ? "=" : d > 0 ? `▲ +${d}pp` : `▼ ${d}pp`;
            };
            return (
              <div key={campaignId} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-900">
                <div className="mb-2 text-sm font-medium">
                  {c.name} <span className="text-xs font-normal text-zinc-400">(janelas de {evo.n} ligações)</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {(
                    [
                      ["Falou humano", evo.primeiras.pctHumano, evo.ultimas.pctHumano],
                      ["Falou decisor", evo.primeiras.pctDecisor, evo.ultimas.pctDecisor],
                      ["Taxa reunião", evo.primeiras.taxaReuniao, evo.ultimas.taxaReuniao],
                    ] as [string, number, number][]
                  ).map(([label, a, b]) => (
                    <div key={label}>
                      <div className="text-xs text-zinc-500">{label}</div>
                      <div className="tabular-nums">
                        {fmtPct(a)} → <strong>{fmtPct(b)}</strong>{" "}
                        <span className="text-xs text-zinc-400">{delta(a, b)}</span>
                      </div>
                    </div>
                  ))}
                  <div>
                    <div className="text-xs text-zinc-500">Dor média</div>
                    <div className="tabular-nums">
                      {fmt1(evo.primeiras.dorMedia)} → <strong>{fmt1(evo.ultimas.dorMedia)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
