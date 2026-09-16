"use client";

import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

/**
 * A seta entre dois menus, com lixeira no meio (igual n8n). Sem isso, desfazer
 * uma ligação errada só era possível clicando na seta e apertando Delete — o que
 * ninguém descobre sozinho.
 *
 * O que a lixeira faz depende de qual seta é:
 *   · cinza (padrão do menu) → o menu deixa de ter destino padrão
 *   · azul (destino de uma opção) → a opção volta a seguir o padrão do menu
 * Por isso o título do botão muda — apagar não é sempre a mesma coisa.
 */

export type LigacaoEdgeData = {
  ehPadrao: boolean;
  onRemover: (edgeId: string) => void;
};

export type LigacaoEdgeType = Edge<LigacaoEdgeData, "ligacao">;

export function LigacaoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<LigacaoEdgeType>) {
  const [sobre, setSobre] = useState(false);
  const [caminho, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={caminho} markerEnd={markerEnd} style={style} interactionWidth={24} />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={() => data?.onRemover(id)}
          onMouseEnter={() => setSobre(true)}
          onMouseLeave={() => setSobre(false)}
          title={
            data?.ehPadrao
              ? "remover o padrão deste menu — as opções sem destino próprio ficam sem saída"
              : "remover o destino desta opção — ela volta a seguir o padrão do menu"
          }
          className={`nodrag nopan pointer-events-auto absolute flex size-5 cursor-pointer items-center justify-center rounded-full border text-[10px] leading-none transition-colors ${
            sobre
              ? "border-red-400 bg-red-500 text-white"
              : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          ✕
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
