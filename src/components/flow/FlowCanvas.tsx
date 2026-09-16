"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,

  type EdgeChange,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { indexGraph, type FlowGraph, type FlowMenu, type FlowOption } from "@/core/script-flow";
import {
  criarMenu,
  definirDestinoOpcao,
  definirPadrao,
  moverMenu,
} from "@/app/campaigns/[slug]/fluxo/actions";
import { MenuNode, type MenuNodeData, type MenuNodeType } from "./MenuNode";
import { LigacaoEdge, type LigacaoEdgeType } from "./LigacaoEdge";
import { OpcaoPanel, MenuPanel } from "./FlowPanels";

/**
 * O canvas de montagem do fluxo, no modelo do Typebot: cada card é um MENU e
 * cada bolinha é uma saída. Arrastar de uma bolinha até outro card cria a
 * ligação — da OPÇÃO, se você puxou da linha dela, ou do MENU INTEIRO, se puxou
 * do "Default".
 *
 * Essa distinção é o ponto: o Default liga o menu de uma vez, então acrescentar
 * uma variação depois não custa ligação nenhuma. A bolinha da opção fica pra
 * exceção — a objeção que desvia do caminho comum.
 *
 * Posição é otimista (arrastar não pode piscar); o resto volta renderizado pelo
 * revalidatePath das actions.
 */

// fora do componente: o ReactFlow remonta tudo se esses objetos mudarem de identidade
const nodeTypes = { menu: MenuNode };
const edgeTypes = { ligacao: LigacaoEdge };

const COR_PADRAO = "#a1a1aa"; // zinc-400 — a ligação do menu inteiro
const COR_OPCAO = "#0ea5e9"; // sky-500 — a exceção, de uma opção só

export function FlowCanvas({
  campaignId,
  graph,
  opcoesSoltas,
  todasOpcoes,
}: {
  campaignId: string;
  graph: FlowGraph;
  opcoesSoltas: FlowOption[];
  todasOpcoes: FlowOption[];
}) {
  const ix = useMemo(() => indexGraph(graph), [graph]);
  const [, startTransition] = useTransition();
  const [pendente, setPendente] = useState(false);

  const [selecionada, setSelecionada] = useState<{ menuId: string; opcaoId: string } | null>(null);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [novaEm, setNovaEm] = useState<string | null>(null);

  const acoesDoCard = useMemo(
    () => ({
      onSelecionar: (menuId: string, opcaoId: string) => {
        setMenuAberto(null);
        setSelecionada({ menuId, opcaoId });
      },
      onNovaOpcao: (menuId: string) => {
        setSelecionada(null);
        setMenuAberto(null);
        setNovaEm(menuId);
      },
      onAbrirMenu: (menuId: string) => {
        setSelecionada(null);
        setMenuAberto(menuId);
      },
    }),
    [],
  );

  const dadosDoCard = useCallback(
    (menu: FlowMenu, sel: { menuId: string; opcaoId: string } | null): MenuNodeData => ({
      menu,
      selecionadaId: sel?.menuId === menu.id ? sel.opcaoId : null,
      comDestinoProprio: menu.opcoes.filter((o) => o.proximoId).length,
      ...acoesDoCard,
    }),
    [acoesDoCard],
  );

  /**
   * Os nós são ESTADO, não derivados do render.
   *
   * O ReactFlow guarda coisas dentro do próprio objeto do nó (`measured`,
   * `dragging`, `selected`). Se a gente reconstrói o array a cada render — e
   * durante um arrasto isso é todo frame — esses campos somem, ele re-mede o
   * card do zero e o resultado é o card piscando/sumindo enquanto você arrasta.
   * Então o ReactFlow é dono do array, e a gente só reconcilia o `data` quando o
   * servidor manda dado novo.
   */
  const [nodes, setNodes] = useState<MenuNodeType[]>(() =>
    graph.menus.map((menu) => ({
      id: menu.id,
      type: "menu" as const,
      position: { x: menu.posX, y: menu.posY },
      data: dadosDoCard(menu, null),
    })),
  );

  // reconciliação durante o render (padrão "ajustar estado quando a prop muda"):
  // preserva posição e campos internos do ReactFlow, troca só o conteúdo.
  const [visto, setVisto] = useState<{ graph: FlowGraph; sel: typeof selecionada }>({ graph, sel: selecionada });
  if (visto.graph !== graph || visto.sel !== selecionada) {
    setVisto({ graph, sel: selecionada });
    setNodes((atuais) => {
      const porId = new Map(atuais.map((n) => [n.id, n]));
      return graph.menus.map((menu) => {
        const anterior = porId.get(menu.id);
        return anterior
          ? { ...anterior, data: dadosDoCard(menu, selecionada) }
          : {
              id: menu.id,
              type: "menu" as const,
              position: { x: menu.posX, y: menu.posY },
              data: dadosDoCard(menu, selecionada),
            };
      });
    });
  }

  const roda = useCallback((fn: () => Promise<unknown>) => {
    setPendente(true);
    startTransition(async () => {
      await fn();
      setPendente(false);
    });
  }, []);

  /**
   * Desfaz uma ligação. O id da aresta carrega o que precisa: "d:menuId" é o
   * padrão do menu, "o:menuId:opcaoId" é o destino de uma opção.
   */
  const removerLigacao = useCallback(
    (edgeId: string) => {
      const [tipo, a, b] = edgeId.split(":");
      if (tipo === "d") roda(() => definirPadrao(a, null));
      if (tipo === "o") roda(() => definirDestinoOpcao(b, null));
    },
    [roda],
  );

  const edges: LigacaoEdgeType[] = useMemo(() => {
    const out: LigacaoEdgeType[] = [];
    for (const menu of graph.menus) {
      if (menu.padraoId && ix.menus.has(menu.padraoId)) {
        out.push({
          id: `d:${menu.id}`,
          type: "ligacao",
          source: menu.id,
          sourceHandle: "default",
          target: menu.padraoId,
          style: { stroke: COR_PADRAO, strokeWidth: 2 },
          data: { ehPadrao: true, onRemover: removerLigacao },
        });
      }
      for (const o of menu.opcoes) {
        if (!o.proximoId || !ix.menus.has(o.proximoId)) continue;
        out.push({
          id: `o:${menu.id}:${o.id}`,
          type: "ligacao",
          source: menu.id,
          sourceHandle: `opt:${o.id}`,
          target: o.proximoId,
          style: { stroke: COR_OPCAO, strokeWidth: 2 },
          data: { ehPadrao: false, onRemover: removerLigacao },
        });
      }
    }
    return out;
  }, [graph.menus, ix, removerLigacao]);

  /** Soltou uma seta num card: vira destino da opção ou padrão do menu. */
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const opcaoId = c.sourceHandle?.startsWith("opt:") ? c.sourceHandle.slice(4) : null;
      roda(() => (opcaoId ? definirDestinoOpcao(opcaoId, c.target) : definirPadrao(c.source!, c.target)));
    },
    [roda],
  );

  // a tecla Delete continua funcionando, além da lixeira na seta
  const onEdgesChange = useCallback(
    (mudancas: EdgeChange[]) => {
      for (const m of mudancas) if (m.type === "remove") removerLigacao(m.id);
    },
    [removerLigacao],
  );

  // deixa o ReactFlow aplicar as mudanças dele (posição, medida, seleção) no
  // array — é o que mantém `measured` vivo e o arrasto estável
  const onNodesChange = useCallback(
    (mudancas: NodeChange<MenuNodeType>[]) => setNodes((atuais) => applyNodeChanges(mudancas, atuais)),
    [],
  );

  // derivado, não corrigido num efeito: o revalidate pode ter apagado o que
  // estava aberto, e aí o painel simplesmente some em vez de apontar pro vazio
  const menuSelecionado: FlowMenu | null = menuAberto ? (ix.menus.get(menuAberto) ?? null) : null;
  const opcaoSelecionada = selecionada ? (ix.opcoes.get(selecionada.opcaoId) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5" style={{ background: COR_PADRAO }} /> padrão do menu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5" style={{ background: COR_OPCAO }} /> destino de uma opção
        </span>
        <span className="text-zinc-400">
arraste de uma bolinha até outro card pra ligar · clique no ✕ da seta pra desfazer
        </span>
        {pendente && <span className="ml-auto text-sky-500">salvando…</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="h-[70vh] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            // posição não passa por roda(): não precisa de "salvando…" nem de
            // re-render — o servidor só grava, sem revalidate
            onNodeDragStop={(_, node) => void moverMenu(node.id, node.position.x, node.position.y)}
            fitView
            proOptions={{ hideAttribution: false }}
            className="bg-zinc-50 dark:bg-zinc-950"
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable className="!bg-white dark:!bg-zinc-900" />
          </ReactFlow>
        </div>

        <div className="flex flex-col gap-3">
          <NovoMenu campaignId={campaignId} quantos={graph.menus.length} />

          {novaEm && (
            <OpcaoPanel
              modo="criar"
              campaignId={campaignId}
              menuId={novaEm}
              menus={graph.menus}
              todasOpcoes={todasOpcoes}
              onFechar={() => setNovaEm(null)}
            />
          )}

          {opcaoSelecionada && selecionada && (
            <OpcaoPanel
              key={opcaoSelecionada.id}
              modo="editar"
              campaignId={campaignId}
              menuId={selecionada.menuId}
              opcao={opcaoSelecionada}
              menus={graph.menus}
              todasOpcoes={todasOpcoes}
              emQuantosMenus={ix.menusDaOpcao.get(opcaoSelecionada.id)?.length ?? 0}
              onFechar={() => setSelecionada(null)}
            />
          )}

          {menuSelecionado && (
            <MenuPanel
              key={menuSelecionado.id}
              campaignId={campaignId}
              menu={menuSelecionado}
              menus={graph.menus}
              todasOpcoes={todasOpcoes}
              onFechar={() => setMenuAberto(null)}
            />
          )}

          {!novaEm && !opcaoSelecionada && !menuSelecionado && (
            <p className="rounded-xl border border-dashed border-zinc-300 p-3 text-xs text-zinc-400 dark:border-zinc-700">
              Clique numa opção pra editar a fala, ou no título do card pra mexer no menu.
            </p>
          )}

          {opcoesSoltas.length > 0 && (
            <div className="rounded-xl border border-dashed border-amber-300 p-3 dark:border-amber-800">
              <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Opções fora de menu ({opcoesSoltas.length})
              </h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Existem, mas não aparecem em lugar nenhum da ligação. Abra um menu e use “reusar opção”.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {opcoesSoltas.map((o) => (
                  <span
                    key={o.id}
                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] dark:border-zinc-800"
                  >
                    {o.titulo}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cria um menu novo, jogado num canto livre do canvas. */
function NovoMenu({ campaignId, quantos }: { campaignId: string; quantos: number }) {
  const [aberto, setAberto] = useState(false);
  // empilha na diagonal pra não nascer em cima de outro
  const acao = criarMenu.bind(null, campaignId, 60 + quantos * 30, 60 + quantos * 30);
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="cursor-pointer rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100"
      >
        + novo menu
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await acao({}, fd);
        setAberto(false);
      }}
      className="flex gap-1 rounded-xl border border-zinc-300 p-2 dark:border-zinc-700"
    >
      <input
        name="nome"
        autoFocus
        required
        placeholder="nome do menu (ex.: Objeções)"
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button type="submit" className="cursor-pointer rounded bg-zinc-900 px-2 text-xs text-white dark:bg-white dark:text-zinc-900">
        criar
      </button>
    </form>
  );
}
