/**
 * Funil por RAZÕES, não totais (fundamento do playbook). Cada gargalo aponta a
 * causa: lista/timing, targeting ou oferta/handoff.
 */
export type FunnelCounts = {
  discadas: number;
  conversas: number; // falou com humano (a moeda real)
  qualificados: number;
  reunioes: number;
  discadasHoje: number;
  conversasHoje: number;
};

export function funnelRates(c: FunnelCounts) {
  return {
    conversa: c.discadas ? c.conversas / c.discadas : 0,
    qualif: c.conversas ? c.qualificados / c.conversas : 0,
    reuniao: c.qualificados ? c.reunioes / c.qualificados : 0,
  };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Diagnóstico do playbook: razões apontam onde o funil vaza. */
export function diagnose(c: FunnelCounts): { tone: "warn" | "good"; text: string }[] {
  const r = funnelRates(c);
  const out: { tone: "warn" | "good"; text: string }[] = [];

  if (c.discadas >= 10 && r.conversa < 0.2)
    out.push({ tone: "warn", text: "Muita discada, pouca conversa → lista ou timing (mire as golden hours)." });
  if (c.conversas >= 5 && r.qualif < 0.3)
    out.push({ tone: "warn", text: "Muita conversa, pouco qualificado → targeting (falando com quem não tem a dor)." });
  if (c.qualificados >= 3 && r.reuniao < 0.4)
    out.push({ tone: "warn", text: "Muito qualificado, pouca reunião → oferta ou handoff." });

  if (out.length === 0) {
    out.push({
      tone: "good",
      text: c.discadas > 0 ? "Funil saudável — mantém a cadência." : "Sem ligações ainda. Disca em bloco nas golden hours.",
    });
  }
  return out;
}
