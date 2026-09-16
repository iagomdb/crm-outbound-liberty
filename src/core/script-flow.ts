import type { scriptNodeKind } from "../db/schema";

/**
 * O FLUXO: script ramificado da carteira, modelado em MENUS.
 *
 * Um MENU é um momento da conversa com várias saídas ("Abertura", "Reação",
 * "Objeções"). Uma OPÇÃO é uma fala dentro do menu. A ligação sai da OPÇÃO e
 * chega num MENU INTEIRO — não em outra opção.
 *
 * Esse nível é o que torna o fluxo manutenível. Com 3 variações por passo,
 * ligar dois passos no modelo opção→opção custava 3×3 arestas e cada variação
 * nova custava mais 6. Apontando pro menu, ligar custa 1 e a variação nova custa
 * zero: ela nasce dentro do menu que todo mundo já enxerga.
 *
 * O destino tem dois níveis (o "Default" do Typebot): a opção pode ter o seu, e
 * quando não tem, cai no padrão do MENU EM QUE FOI CLICADA. Por isso o caminho
 * guarda o par (menu, opção) — a mesma opção reusada em dois menus pode seguir
 * pra lugares diferentes, e é isso que resolve "o galho depende de como cheguei".
 *
 * Nada de banco e nada de React aqui: server e client importam o mesmo módulo.
 */

export type NodeKind = (typeof scriptNodeKind.enumValues)[number];

/** Uma fala dentro de um menu. */
export type FlowOption = {
  id: string;
  kind: NodeKind;
  titulo: string;
  fala: string | null;
  nota: string | null;
  /** destino próprio; null = usa o padrão do menu de onde foi clicada */
  proximoId: string | null;
};

/** Um momento da conversa: o card do canvas, a coluna da discagem. */
export type FlowMenu = {
  id: string;
  nome: string;
  entrada: boolean;
  /** pra onde vão as opções sem destino próprio */
  padraoId: string | null;
  posX: number;
  posY: number;
  /** já na ordem de exibição */
  opcoes: FlowOption[];
};

/** O fluxo inteiro de uma carteira, como atravessa a fronteira server→client. */
export type FlowGraph = { menus: FlowMenu[] };

/** Um passo do caminho percorrido: qual opção, clicada em qual menu. */
export type Passo = { menuId: string; opcaoId: string };

/** Como fica gravado em `activities.caminho` (formato estável desde o v1). */
export type CaminhoStep = { nodeId: string; titulo: string; kind: string };

export const KIND_LABELS: Record<NodeKind, string> = {
  fala: "eu falo",
  reacao: "ele reage",
  saida: "acaba aqui",
};

/**
 * Cores por tipo de opção. Não é decoração: na ligação você precisa saber num
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

export type FlowIndex = {
  menus: Map<string, FlowMenu>;
  opcoes: Map<string, FlowOption>;
  /** em quais menus cada opção aparece — o "reusada em N lugares" do editor */
  menusDaOpcao: Map<string, FlowMenu[]>;
  /** quais menus apontam pra cada menu (por padrão ou por opção) */
  origensDoMenu: Map<string, FlowMenu[]>;
  entrada: FlowMenu | null;
};

export function indexGraph(graph: FlowGraph): FlowIndex {
  const menus = new Map(graph.menus.map((m) => [m.id, m]));
  const opcoes = new Map<string, FlowOption>();
  const menusDaOpcao = new Map<string, FlowMenu[]>();
  const origensDoMenu = new Map<string, FlowMenu[]>();

  const liga = (destinoId: string | null, origem: FlowMenu) => {
    if (!destinoId || !menus.has(destinoId)) return;
    const atual = origensDoMenu.get(destinoId) ?? [];
    if (!atual.some((m) => m.id === origem.id)) atual.push(origem);
    origensDoMenu.set(destinoId, atual);
  };

  for (const menu of graph.menus) {
    liga(menu.padraoId, menu);
    for (const op of menu.opcoes) {
      opcoes.set(op.id, op);
      const lista = menusDaOpcao.get(op.id) ?? [];
      lista.push(menu);
      menusDaOpcao.set(op.id, lista);
      liga(op.proximoId, menu);
    }
  }

  return { menus, opcoes, menusDaOpcao, origensDoMenu, entrada: graph.menus.find((m) => m.entrada) ?? null };
}

/**
 * Pra onde leva clicar `opcaoId` estando no menu `menuId`. O menu importa: a
 * opção sem destino próprio herda o padrão de ONDE foi clicada.
 */
export function destinoDe(ix: FlowIndex, passo: Passo): FlowMenu | null {
  const menu = ix.menus.get(passo.menuId);
  const opcao = menu?.opcoes.find((o) => o.id === passo.opcaoId);
  if (!menu || !opcao) return null;
  const alvo = opcao.proximoId ?? menu.padraoId;
  return alvo ? (ix.menus.get(alvo) ?? null) : null;
}

/**
 * As colunas a desenhar para um caminho. Coluna 0 = o menu de entrada; coluna
 * i+1 = o destino do passo i.
 *
 * `incluirVazia` decide o que fazer quando o último passo não leva a lugar
 * nenhum: na ligação a coluna vazia é ruído, mas no editor é onde cabe o
 * "definir destino".
 *
 * Iterativo de propósito: um ciclo ("volta pra objeção") faz você andar em
 * círculo, que é o comportamento certo — não trava a renderização.
 */
export function colunasDoCaminho(
  ix: FlowIndex,
  caminho: Passo[],
  { incluirVazia = false }: { incluirVazia?: boolean } = {},
): { menu: FlowMenu; escolhida: string | null }[] {
  if (!ix.entrada) return [];
  const cols: { menu: FlowMenu; escolhida: string | null }[] = [
    { menu: ix.entrada, escolhida: caminho[0]?.opcaoId ?? null },
  ];
  for (const [i, passo] of caminho.entries()) {
    const destino = destinoDe(ix, passo);
    if (!destino) {
      if (incluirVazia && i === caminho.length - 1) break; // o editor trata o fim do galho no painel
      break;
    }
    cols.push({ menu: destino, escolhida: caminho[i + 1]?.opcaoId ?? null });
  }
  return cols;
}

/**
 * Clique na coluna `nivel`: trunca o caminho ali e põe a opção nova no lugar.
 * Clicar na opção já escolhida desfaz (volta um passo) — é como você corrige no
 * meio da ligação sem recomeçar.
 */
export function escolher(caminho: Passo[], nivel: number, menuId: string, opcaoId: string): Passo[] {
  if (caminho[nivel]?.opcaoId === opcaoId) return caminho.slice(0, nivel);
  return [...caminho.slice(0, nivel), { menuId, opcaoId }];
}

/** Caminho → o que vai gravado na ligação. Ignora opção que não existe mais. */
export function caminhoParaRegistro(ix: FlowIndex, caminho: Passo[]): CaminhoStep[] {
  return caminho
    .map((p) => ix.opcoes.get(p.opcaoId))
    .filter((o): o is FlowOption => Boolean(o))
    .map((o) => ({ nodeId: o.id, titulo: o.titulo, kind: o.kind }));
}

/** Opções que nenhum menu contém — existem no banco mas ninguém alcança. */
export function opcoesSoltas(graph: FlowGraph, todas: FlowOption[]): FlowOption[] {
  const usadas = new Set(graph.menus.flatMap((m) => m.opcoes.map((o) => o.id)));
  return todas.filter((o) => !usadas.has(o.id));
}

/** Menus que ninguém alcança (e não são a entrada) — galho órfão no canvas. */
export function menusSoltos(ix: FlowIndex): FlowMenu[] {
  return [...ix.menus.values()].filter((m) => !m.entrada && !(ix.origensDoMenu.get(m.id)?.length ?? 0));
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
  /** quantas ligações passaram por essa opção */
  passou: number;
  reuniao: number;
  email: number;
  /** quantas MORRERAM aqui — foi a última do caminho, sem objetivo batido */
  morreu: number;
};

/**
 * Estatística por opção. É o pagamento do modelo: em vez de "onde travou"
 * digitado à mão, "qual abertura converte" e "onde a conversa morre" viram
 * contagem em cima de dado estruturado.
 *
 * `morreu` é a morte da conversa: última opção do caminho numa ligação em que
 * você falou com humano e não bateu objetivo. Sem humano não conta — não
 * atender não é o script falhando.
 */
export function statsPorNo(rows: CaminhoRow[]): NodeStat[] {
  const acc = new Map<string, NodeStat>();
  const pega = (s: CaminhoStep) => {
    let cur = acc.get(s.nodeId);
    if (!cur) {
      cur = { nodeId: s.nodeId, titulo: s.titulo, kind: s.kind, passou: 0, reuniao: 0, email: 0, morreu: 0 };
      acc.set(s.nodeId, cur);
    }
    // o título mais recente ganha: opção renomeada não vira duas linhas
    cur.titulo = s.titulo;
    return cur;
  };

  for (const row of rows) {
    const passos = row.caminho;
    if (!passos?.length) continue;
    // um ciclo pode repetir a opção no caminho — conta a ligação uma vez só
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
 * Comparação entre as ABERTURAS — o A/B em blocos de 20 ligações. Só as opções
 * do menu de entrada, ordenadas por conversão.
 */
export function statsDeAbertura(rows: CaminhoRow[], entradaIds: Set<string>): NodeStat[] {
  const primeiras = rows
    .filter((r) => r.caminho?.length && entradaIds.has(r.caminho[0].nodeId))
    .map((r) => ({ ...r, caminho: r.caminho!.slice(0, 1) }));
  return statsPorNo(primeiras);
}
