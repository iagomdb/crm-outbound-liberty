// Estatísticas de ICP: transforma cada ligação num ponto de dado pra validar
// hipóteses de mercado por carteira (segmento). Módulo puro — recebe linhas
// cruas e devolve as métricas; as queries ficam em db/queries.ts.

// Tipos espelham os enums de db/schema.ts (sem importar o schema: este módulo
// entra no bundle do client via CallLogForm).
export type IcpGradeT = "A" | "B" | "C" | "D";
export type CobrancaT = "nao_possui" | "cobranca_interna" | "juridico_interno" | "escritorio_terceirizado" | "nao_soube";
export type FaixaClientesT = "ate_50" | "de_51_200" | "de_201_500" | "mais_500";
export type PortePercebidoT = "micro" | "pequena" | "media" | "grande";

// -------------------------------------------------------------- labels (form + dashboard)

export const DOR_LABELS: Record<number, string> = {
  0: "0 — Nenhuma",
  1: "1 — Atraso operacional",
  2: "2 — Cobrança interna ativa",
  3: "3 — Crédito difícil (>90 dias)",
  4: "4 — Dor evidente / pediu ajuda",
};

export const ICP_GRADE_LABELS: Record<IcpGradeT, string> = {
  A: "A — Excelente (B2B claro, vende a prazo, cobrança recorrente, ticket relevante)",
  B: "B — Bom (parte das características)",
  C: "C — Médio (alguma possibilidade)",
  D: "D — Ruim (praticamente impossível)",
};

export const COBRANCA_LABELS: Record<CobrancaT, string> = {
  nao_possui: "Não possui",
  cobranca_interna: "Cobrança interna",
  juridico_interno: "Jurídico interno",
  escritorio_terceirizado: "Escritório terceirizado",
  nao_soube: "Não soube informar",
};

export const FAIXA_CLIENTES_LABELS: Record<FaixaClientesT, string> = {
  ate_50: "Até 50",
  de_51_200: "51–200",
  de_201_500: "201–500",
  mais_500: "500+",
};

export const PORTE_PERCEBIDO_LABELS: Record<PortePercebidoT, string> = {
  micro: "Micro",
  pequena: "Pequena",
  media: "Média",
  grande: "Grande",
};

/** A=4 … D=1, pra médias ("3.7 / 4"). */
const GRADE_POINTS: Record<IcpGradeT, number> = { A: 4, B: 3, C: 2, D: 1 };

/** Média numérica → letra aproximada ("A-", "B+"…). */
export function gradeFromAvg(avg: number): string {
  if (avg >= 3.75) return "A";
  if (avg >= 3.25) return "A-";
  if (avg >= 2.75) return "B";
  if (avg >= 2.25) return "B-";
  if (avg >= 1.75) return "C";
  if (avg >= 1.25) return "C-";
  return "D";
}

// -------------------------------------------------------------- entrada (linhas cruas)

export type IcpRawTarget = {
  targetId: string;
  campaignId: string;
  icpGrade: IcpGradeT | null;
  tipoCobranca: CobrancaT | null;
};

export type IcpRawCall = {
  targetId: string;
  campaignId: string;
  occurredAt: Date;
  reachedHuman: boolean;
  dorPercebida: number | null;
  falouComDecisor: boolean;
  objection: string;
  stalledAt: string | null;
  objectiveHit: string;
  abordagens: { itemId: string; categoria: string; opcao: string }[] | null;
};

export type IcpRawMeeting = { campaignId: string; targetId: string };

// -------------------------------------------------------------- score (fórmula da spec)

type TargetAggregate = {
  ligacoes: number;
  falouHumano: boolean;
  falouDecisor: boolean;
  dorMax: number | null;
  icpGrade: IcpGradeT | null;
  temEscritorio: boolean;
  teveReuniao: boolean;
};

/**
 * ICP Score por alvo:
 * decisor 2 · dor 3 → 4 · dor 4 → 6 · ICP B → 2 · ICP A → 4 ·
 * possui escritório → 2 · reunião → 10 · follow-up (≥2 ligações) → 2
 */
export function icpScore(t: TargetAggregate): number {
  let pts = 0;
  if (t.falouDecisor) pts += 2;
  if (t.dorMax === 3) pts += 4;
  if (t.dorMax === 4) pts += 6;
  if (t.icpGrade === "B") pts += 2;
  if (t.icpGrade === "A") pts += 4;
  if (t.temEscritorio) pts += 2;
  if (t.teveReuniao) pts += 10;
  if (t.ligacoes >= 2) pts += 2;
  return pts;
}

// -------------------------------------------------------------- hipótese (veredito automático)

export type HypothesisStatus = "forte" | "fraca" | "em_teste" | "amostra_insuficiente";

export const HYPOTHESIS_UI: Record<HypothesisStatus, { label: string; emoji: string }> = {
  forte: { label: "Hipótese forte", emoji: "✅" },
  fraca: { label: "Hipótese fraca", emoji: "❌" },
  em_teste: { label: "Em teste", emoji: "🧪" },
  amostra_insuficiente: { label: "Amostra insuficiente", emoji: "🔬" },
};

const MIN_SAMPLE = 30;

export function hypothesisStatus(s: {
  ligadas: number;
  dorMedia: number | null;
  icpMedio: number | null;
  reunioes: number;
  taxaReuniao: number | null;
}): HypothesisStatus {
  if (s.ligadas < MIN_SAMPLE) return "amostra_insuficiente";
  const dor = s.dorMedia ?? 0;
  const icp = s.icpMedio ?? 0;
  if (dor >= 2.5 && icp >= 3 && (s.taxaReuniao ?? 0) >= 0.08) return "forte";
  if (dor < 1.5 || icp < 2 || (s.ligadas >= 50 && s.reunioes === 0)) return "fraca";
  return "em_teste";
}

// -------------------------------------------------------------- métricas por carteira

export type IcpCampaignStats = {
  campaignId: string;
  empresas: number; // alvos na carteira
  ligadas: number; // alvos com ≥1 ligação
  pctFalouHumano: number | null; // % das ligadas
  pctFalouDecisor: number | null;
  dorMedia: number | null; // média do MÁXIMO de dor por alvo (só avaliados)
  dorAvaliadas: number;
  icpMedio: number | null; // média A=4…D=1 (só avaliados)
  icpAvaliadas: number;
  reunioes: number;
  taxaReuniao: number | null; // reuniões / ligadas
  pctCredito90: number | null; // % das avaliadas com dor ≥ 3
  pctUsamEscritorio: number | null; // % das com tipoCobranca conhecido
  cobrancaConhecida: number;
  scoreTotal: number;
  scoreMedio: number | null; // scoreTotal / ligadas
  hypothesis: HypothesisStatus;
};

export function computeCampaignStats(
  campaignId: string,
  targets: IcpRawTarget[],
  calls: IcpRawCall[],
  meetings: IcpRawMeeting[],
): IcpCampaignStats {
  const myTargets = targets.filter((t) => t.campaignId === campaignId);
  const myCalls = calls.filter((c) => c.campaignId === campaignId);
  const meetingTargets = new Set(meetings.filter((m) => m.campaignId === campaignId).map((m) => m.targetId));

  // agrega por alvo
  const byTarget = new Map<string, TargetAggregate>();
  for (const t of myTargets) {
    byTarget.set(t.targetId, {
      ligacoes: 0,
      falouHumano: false,
      falouDecisor: false,
      dorMax: null,
      icpGrade: t.icpGrade,
      temEscritorio: t.tipoCobranca === "escritorio_terceirizado",
      teveReuniao: meetingTargets.has(t.targetId),
    });
  }
  for (const c of myCalls) {
    const agg = byTarget.get(c.targetId);
    if (!agg) continue;
    agg.ligacoes++;
    if (c.reachedHuman) agg.falouHumano = true;
    if (c.falouComDecisor) agg.falouDecisor = true;
    if (c.dorPercebida != null) agg.dorMax = Math.max(agg.dorMax ?? 0, c.dorPercebida);
    if (c.objectiveHit === "reuniao") agg.teveReuniao = true;
  }

  const ligadas = [...byTarget.values()].filter((a) => a.ligacoes > 0);
  const dorAvaliadas = ligadas.filter((a) => a.dorMax != null);
  const icpAvaliadas = [...byTarget.values()].filter((a) => a.icpGrade != null);
  const cobrancaConhecida = myTargets.filter((t) => t.tipoCobranca != null && t.tipoCobranca !== "nao_soube");
  const reunioes = [...byTarget.values()].filter((a) => a.teveReuniao).length;

  const pct = (n: number, d: number) => (d > 0 ? n / d : null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const dorMedia = avg(dorAvaliadas.map((a) => a.dorMax!));
  const icpMedio = avg(icpAvaliadas.map((a) => GRADE_POINTS[a.icpGrade!]));
  const scoreTotal = ligadas.reduce((sum, a) => sum + icpScore(a), 0);
  const taxaReuniao = pct(reunioes, ligadas.length);

  return {
    campaignId,
    empresas: myTargets.length,
    ligadas: ligadas.length,
    pctFalouHumano: pct(ligadas.filter((a) => a.falouHumano).length, ligadas.length),
    pctFalouDecisor: pct(ligadas.filter((a) => a.falouDecisor).length, ligadas.length),
    dorMedia,
    dorAvaliadas: dorAvaliadas.length,
    icpMedio,
    icpAvaliadas: icpAvaliadas.length,
    reunioes,
    taxaReuniao,
    pctCredito90: pct(dorAvaliadas.filter((a) => a.dorMax! >= 3).length, dorAvaliadas.length),
    pctUsamEscritorio: pct(
      cobrancaConhecida.filter((t) => t.tipoCobranca === "escritorio_terceirizado").length,
      cobrancaConhecida.length,
    ),
    cobrancaConhecida: cobrancaConhecida.length,
    scoreTotal,
    scoreMedio: ligadas.length ? scoreTotal / ligadas.length : null,
    hypothesis: hypothesisStatus({
      ligadas: ligadas.length,
      dorMedia,
      icpMedio,
      reunioes,
      taxaReuniao,
    }),
  };
}

// -------------------------------------------------------------- evolução (primeiras vs últimas N ligações)

export type EvolutionWindow = {
  ligacoes: number;
  pctHumano: number;
  pctDecisor: number;
  dorMedia: number | null;
  taxaReuniao: number;
};

export type Evolution = { n: number; primeiras: EvolutionWindow; ultimas: EvolutionWindow } | null;

/** Compara as primeiras N vs últimas N ligações (N = min(100, metade) — precisa de ≥40 no total). */
export function computeEvolution(calls: IcpRawCall[]): Evolution {
  if (calls.length < 40) return null;
  const sorted = [...calls].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const n = Math.min(100, Math.floor(sorted.length / 2));

  const win = (slice: IcpRawCall[]): EvolutionWindow => {
    const dores = slice.filter((c) => c.dorPercebida != null).map((c) => c.dorPercebida!);
    return {
      ligacoes: slice.length,
      pctHumano: slice.filter((c) => c.reachedHuman).length / slice.length,
      pctDecisor: slice.filter((c) => c.falouComDecisor).length / slice.length,
      dorMedia: dores.length ? dores.reduce((a, b) => a + b, 0) / dores.length : null,
      taxaReuniao: slice.filter((c) => c.objectiveHit === "reuniao").length / slice.length,
    };
  };

  return { n, primeiras: win(sorted.slice(0, n)), ultimas: win(sorted.slice(-n)) };
}

// -------------------------------------------------------------- teste A/B de abordagens

export type AbStat = {
  categoria: string;
  opcao: string;
  ligacoes: number;
  falouDecisor: number;
  reunioes: number;
  taxaReuniao: number;
};

/** Compara variações de abordagem (ex.: qual abertura converte mais) nas ligações de uma carteira. */
export function computeAbStats(calls: IcpRawCall[]): AbStat[] {
  const map = new Map<string, AbStat>();
  for (const c of calls) {
    for (const a of c.abordagens ?? []) {
      const key = `${a.categoria} ${a.opcao}`;
      const s = map.get(key) ?? {
        categoria: a.categoria,
        opcao: a.opcao,
        ligacoes: 0,
        falouDecisor: 0,
        reunioes: 0,
        taxaReuniao: 0,
      };
      s.ligacoes++;
      if (c.falouComDecisor) s.falouDecisor++;
      if (c.objectiveHit === "reuniao") s.reunioes++;
      map.set(key, s);
    }
  }
  return [...map.values()]
    .map((s) => ({ ...s, taxaReuniao: s.reunioes / s.ligacoes }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || b.taxaReuniao - a.taxaReuniao || b.ligacoes - a.ligacoes);
}

// -------------------------------------------------------------- frases onde morreu

/** Normaliza a frase pra agrupar variações triviais ("Manda um e-mail." ≈ "manda um email"). */
export function normalizePhrase(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/e-mail/g, "email")
    .replace(/["""'']/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function topPhrases(calls: IcpRawCall[], limit: number): { frase: string; n: number }[] {
  const counts = new Map<string, { frase: string; n: number }>();
  for (const c of calls) {
    if (!c.stalledAt) continue;
    const key = normalizePhrase(c.stalledAt);
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.n++;
    else counts.set(key, { frase: c.stalledAt.trim(), n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}
