/**
 * Contagens e taxas do funil (discadas → conversas → qualificados → reuniões).
 * Só os números: a leitura do que eles significam é do operador, não do CRM.
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
