import type { scriptNodeKind } from "../db/schema";

/**
 * O FLUXO: grafo do script ramificado da carteira (tabelas `script_nodes` /
 * `script_edges`). Aqui mora só a forma — montar o grafo, andar por ele e ler o
 * caminho percorrido. Nada de banco e nada de React: server e client importam
 * o mesmo módulo.
 *
 * Por que grafo e não árvore: uma objeção não pertence a um ponto do script.
 * "Manda no zap" vem depois da abertura E depois da CTA, e tem que ser o MESMO
 * nó — senão você edita a resposta em seis lugares e a estatística dela sai
 * partida em seis pedaços.
 */

export type NodeKind = (typeof scriptNodeKind.enumValues)[number];

/** Um nó como o client recebe (já serializado, sem Date). */
export type FlowNode = {
  id: string;
  kind: NodeKind;
  titulo: string;
  fala: string | null;
  nota: string | null;
  entrada: boolean;
  ordem: number;
};

export type FlowEdge = { fromId: string; toId: string; ordem: number };

/** O grafo inteiro de uma carteira, do jeito que atravessa a fronteira server→client. */
export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

/** Um passo do caminho, como fica gravado em `activities.caminho`. */
export type CaminhoStep = { nodeId: string; titulo: string; kind: string };

export const KIND_LABELS: Record<NodeKind, string> = {
  fala: "eu falo",
  reacao: "ele reage",
  saida: "acaba aqui",
};

/**
 * Cores por tipo de nó. Não é decoração: na ligação você precisa saber num
 * relance se aquele card é a sua fala ou a reação dele, sem ler.
 */
export const KIND_CLASSES: Record<NodeKind, { card: string; on: string; dot: string; texto: string }> = {
  fala: {
    card: "border-sky-200 hover:border-sky-400 dark:border-sky-900 dark:hover:border-sky-700",
    on: "border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950",
    dot: "bg-sky-500",
    texto: "text-sky-700 dark:text-sky-300",
  },
  reacao: {
    card: "border-amber-200 hover:border-amber-400 dark:border-amber-900 dark:hover:border-amber-700",
    on: "border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-950",
    dot: "bg-amber-500",
    texto: "text-amber-700 dark:text-amber-300",
  },
  saida: {
    card: "border-emerald-200 hover:border-emerald-400 dark:border-emerald-900 dark:hover:border-emerald-700",
    on: "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950",
    dot: "bg-emerald-500",
    texto: "text-emerald-700 dark:text-emerald-300",
  },
};

/** Índice de consulta rápida sobre o grafo — montado uma vez por render. */
export type FlowIndex = {
  byId: Map<string, FlowNode>;
  /** filhos de cada nó, já na ordem da aresta */
  filhos: Map<string, FlowNode[]>;
  /** pais de cada nó — o "linkado em N lugares" do editor */
  pais: Map<string, FlowNode[]>;
  /** as aberturas: primeira coluna da ligação */
  entradas: FlowNode[];
};

const porOrdem = (a: { ordem: number; titulo: string }, b: { ordem: number; titulo: string }) =>
  a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR");

export function indexGraph(graph: FlowGraph): FlowIndex {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const filhos = new Map<string, FlowNode[]>();
  const pais = new Map<string, FlowNode[]>();

  // aresta órfã (nó apagado fora de uma transação) não pode derrubar a tela
  const arestas = [...graph.edges].sort((a, b) => a.ordem - b.ordem);
  for (const e of arestas) {
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    if (!from || !to) continue;
    if (!filhos.has(e.fromId)) filhos.set(e.fromId, []);
    filhos.get(e.fromId)!.push(to);
    if (!pais.has(e.toId)) pais.set(e.toId, []);
    pais.get(e.toId)!.push(from);
  }

  const entradas = graph.nodes.filter((n) => n.entrada).sort(porOrdem);
  return { byId, filhos, pais, entradas };
}

export const filhosDe = (ix: FlowIndex, id: string): FlowNode[] => ix.filhos.get(id) ?? [];

/**
 * As colunas a desenhar para um caminho. Coluna 0 = as aberturas; coluna i+1 =
 * os filhos do nó escolhido na coluna i.
 *
 * `incluirVazia` decide o que fazer quando o último passo escolhido não tem
 * filhos: na ligação a coluna vazia é ruído (não há pra onde ir), mas no editor
 * ela é o único lugar onde cabe o "+ próximo passo" — sem ela um nó folha nunca
 * ganharia o primeiro filho.
 *
 * É iterativo de propósito: um ciclo no grafo ("volta pra objeção") faz você
 * andar em círculo, que é o comportamento certo — não trava a renderização.
 */
export function colunasDoCaminho(
  ix: FlowIndex,
  caminho: string[],
  { incluirVazia = false }: { incluirVazia?: boolean } = {},
): { escolhido: string | null; opcoes: FlowNode[] }[] {
  const cols: { escolhido: string | null; opcoes: FlowNode[] }[] = [{ escolhido: caminho[0] ?? null, opcoes: ix.entradas }];
  for (const [i, id] of caminho.entries()) {
    const opcoes = filhosDe(ix, id);
    if (!opcoes.length) {
      if (incluirVazia && i === caminho.length - 1) cols.push({ escolhido: null, opcoes: [] });
      break;
    }
    cols.push({ escolhido: caminho[i + 1] ?? null, opcoes });
  }
  return cols;
}

/**
 * Clique na coluna `nivel`: trunca o caminho ali e põe o nó novo no lugar.
 * Clicar no nó que já estava escolhido desfaz (volta um passo) — é como você
 * corrige no meio da ligação sem ter que recomeçar.
 */
export function escolher(caminho: string[], nivel: number, nodeId: string): string[] {
  if (caminho[nivel] === nodeId) return caminho.slice(0, nivel);
  return [...caminho.slice(0, nivel), nodeId];
}

/** Caminho (ids) → o que vai gravado na ligação. Ignora id que não existe mais. */
export function caminhoParaRegistro(ix: FlowIndex, caminho: string[]): CaminhoStep[] {
  return caminho
    .map((id) => ix.byId.get(id))
    .filter((n): n is FlowNode => Boolean(n))
    .map((n) => ({ nodeId: n.id, titulo: n.titulo, kind: n.kind }));
}

// ---------------------------------------------------------------- aprendizado

export type CaminhoRow = {
  caminho: CaminhoStep[] | null;
  reachedHuman: boolean;
  objectiveHit: string;
};

export type NodeStat = {
  nodeId: string;
  titulo: string;
  kind: string;
  /** quantas ligações passaram por esse nó */
  passou: number;
  /** quantas passaram e terminaram em reunião */
  reuniao: number;
  /** quantas passaram e terminaram em e-mail nominal */
  email: number;
  /** quantas MORRERAM aqui — o nó foi o último do caminho, sem objetivo batido */
  morreu: number;
};

/**
 * Estatística por nó do fluxo. É o pagamento do modelo: em vez de "onde travou"
 * digitado à mão, a pergunta "qual abertura converte" e "onde a conversa morre"
 * viram contagem em cima de dado estruturado.
 *
 * `morreu` é o que o motivo.md chama de morte da conversa: último nó do caminho
 * numa ligação em que você falou com humano e não bateu objetivo nenhum. Sem
 * humano não conta — não atender não é o script falhando.
 */
export function statsPorNo(rows: CaminhoRow[]): NodeStat[] {
  const acc = new Map<string, NodeStat>();
  const pega = (s: CaminhoStep) => {
    let cur = acc.get(s.nodeId);
    if (!cur) {
      cur = { nodeId: s.nodeId, titulo: s.titulo, kind: s.kind, passou: 0, reuniao: 0, email: 0, morreu: 0 };
      acc.set(s.nodeId, cur);
    }
    // o título mais recente ganha: nó renomeado não vira duas linhas
    cur.titulo = s.titulo;
    return cur;
  };

  for (const row of rows) {
    const passos = row.caminho;
    if (!passos?.length) continue;
    // um ciclo pode repetir o nó no caminho — conta a ligação uma vez só
    const vistos = new Set<string>();
    for (const passo of passos) {
      const stat = pega(passo);
      if (!vistos.has(passo.nodeId)) {
        vistos.add(passo.nodeId);
        stat.passou++;
        if (row.objectiveHit === "reuniao") stat.reuniao++;
        if (row.objectiveHit === "email_nominal") stat.email++;
      }
    }
    const ultimo = passos[passos.length - 1];
    if (row.reachedHuman && row.objectiveHit === "nenhum") pega(ultimo).morreu++;
  }

  return [...acc.values()].sort((a, b) => b.passou - a.passou || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/**
 * Comparação entre as ABERTURAS — o A/B que o motivo.md manda fazer em blocos
 * de 20 ligações. Só os nós marcados como entrada, ordenados por conversão.
 */
export function statsDeAbertura(rows: CaminhoRow[], entradaIds: Set<string>): NodeStat[] {
  const primeiras = rows
    .filter((r) => r.caminho?.length && entradaIds.has(r.caminho[0].nodeId))
    .map((r) => ({ ...r, caminho: r.caminho!.slice(0, 1) }));
  return statsPorNo(primeiras);
}
