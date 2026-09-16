"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { KIND_CLASSES, type FlowMenu } from "@/core/script-flow";

/**
 * O card do canvas: um MENU. Cada opção tem a sua bolinha à direita (arrastar
 * dali define o destino DAQUELA opção) e o rodapé tem a bolinha do padrão —
 * o "Default" do Typebot, que vale pra toda opção sem destino próprio.
 *
 * Quem desenha é o canvas; este componente não fala com o servidor. As ações
 * sobem por callbacks guardados no `data` (o ReactFlow não passa props).
 */

export type MenuNodeData = {
  menu: FlowMenu;
  selecionadaId: string | null;
  /** quantas opções deste menu têm destino próprio (fogem do padrão) */
  comDestinoProprio: number;
  onSelecionar: (menuId: string, opcaoId: string) => void;
  onNovaOpcao: (menuId: string) => void;
  onAbrirMenu: (menuId: string) => void;
};

export type MenuNodeType = Node<MenuNodeData, "menu">;

const pontoClasses =
  "!size-2.5 !border-2 !border-white dark:!border-zinc-950 !bg-zinc-400 hover:!bg-sky-500 !transition-colors";

export function MenuNode({ data, selected }: NodeProps<MenuNodeType>) {
  const { menu, selecionadaId, comDestinoProprio, onSelecionar, onNovaOpcao, onAbrirMenu } = data;

  return (
    <div
      className={`w-[260px] rounded-xl border bg-white shadow-sm dark:bg-zinc-900 ${
        selected ? "border-sky-500 ring-2 ring-sky-500/20" : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      {/* entrada do card: é aqui que as setas dos outros menus chegam */}
      <Handle type="target" position={Position.Left} className={pontoClasses} />

      <button
        type="button"
        onClick={() => onAbrirMenu(menu.id)}
        className="flex w-full items-center gap-1.5 rounded-t-xl border-b border-zinc-100 px-3 py-2 text-left dark:border-zinc-800"
      >
        {menu.entrada && (
          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            início
          </span>
        )}
        <span className="truncate text-sm font-semibold">{menu.nome}</span>
        <span className="ml-auto shrink-0 text-xs text-zinc-300 dark:text-zinc-600">⋯</span>
      </button>

      <div className="flex flex-col gap-1 p-2">
        {menu.opcoes.length === 0 && (
          <p className="px-1 py-1.5 text-[11px] text-zinc-400">Menu vazio — adicione a primeira opção.</p>
        )}

        {menu.opcoes.map((o) => {
          const c = KIND_CLASSES[o.kind];
          const on = selecionadaId === o.id;
          return (
            <div key={o.id} className="relative">
              <button
                type="button"
                onClick={() => onSelecionar(menu.id, o.id)}
                className={`flex w-full items-start gap-1.5 rounded-lg border px-2 py-1.5 pr-4 text-left transition-colors ${
                  on ? c.on : `bg-white dark:bg-zinc-950 ${c.card}`
                }`}
              >
                <span className={`mt-1 size-1.5 shrink-0 rounded-full ${c.dot}`} />
                <span className="text-xs leading-snug">{o.titulo}</span>
                {o.proximoId && (
                  <span
                    className="ml-auto shrink-0 text-[9px] text-sky-500"
                    title="esta opção tem destino próprio — não segue o padrão do menu"
                  >
                    ↗
                  </span>
                )}
              </button>
              {/* a bolinha DA OPÇÃO: arrastar daqui liga só ela */}
              <Handle
                type="source"
                id={`opt:${o.id}`}
                position={Position.Right}
                className={pontoClasses}
                style={{ top: "50%" }}
              />
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => onNovaOpcao(menu.id)}
          className="rounded-lg border border-dashed border-zinc-300 px-2 py-1 text-left text-[11px] text-zinc-400 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-200"
        >
          + opção
        </button>
      </div>

      {/* o Default: destino de toda opção que não tem o seu */}
      <div className="relative border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <span className="text-[11px] text-zinc-400">
          Default
          {comDestinoProprio > 0 && (
            <span className="ml-1 text-[10px] text-zinc-300 dark:text-zinc-600">
              ({comDestinoProprio} com destino próprio)
            </span>
          )}
        </span>
        <Handle type="source" id="default" position={Position.Right} className={pontoClasses} style={{ top: "50%" }} />
      </div>
    </div>
  );
}
