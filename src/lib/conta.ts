/**
 * A CONTA ativa: pra quem a prospecção do momento é feita ("Meu", "Liberty").
 * É o agrupador acima da carteira (campaigns.conta) e vive num cookie — o
 * seletor no header troca, e fila/agenda/roleta/contadores passam a enxergar
 * só as carteiras dessa conta. Sem cookie = todas as contas.
 *
 * Só constantes, sem nenhum import: o ContaSwitcher é client component e não
 * deve arrastar next/headers pro bundle do browser. A leitura do cookie mora
 * em conta-server.ts (mesma divisão de auth/cookie.ts).
 */
export const CONTA_COOKIE = "conta";

/** Rótulo do modo "sem filtro". */
export const TODAS_LABEL = "Todas as contas";
