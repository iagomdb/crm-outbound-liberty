"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { colunasDoCaminho, KIND_CLASSES, type FlowIndex, type FlowNode } from "@/core/script-flow";

/**
 * As colunas do FLUXO — o "fluxograma horizontal" em que a discagem e o editor
 * rodam. É a visão em colunas do Finder: coluna 0 são as aberturas, e cada
 * escolha abre a coluna seguinte com o que pode vir depois.
 *
 * Por que colunas e não um canvas com setas: numa ligação você não tem mão pra
 * arrastar e dar zoom. Precisa de um alvo de clique parado no mesmo lugar e de
 * um scroll só, horizontal, que anda sozinho conforme a conversa avança.
 */

const trilhoClasses =
  "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] snap-x snap-mandatory sm:snap-none";

export function FlowColumns({
  ix,
  caminho,
  onPick,
  /** rodapé por coluna — o editor usa pra "+ novo passo"; a ligação não passa nada */
  columnFooter,
  emptyHint,
}: {
  ix: FlowIndex;
  caminho: string[];
  onPick: (nivel: number, nodeId: string) => void;
  columnFooter?: (nivel: number, paiId: string | null) => ReactNode;
  emptyHint?: ReactNode;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  // só o editor (quem passa rodapé) precisa da coluna vazia no fim do galho
  const colunas = colunasDoCaminho(ix, caminho, { incluirVazia: Boolean(columnFooter) });

  // a conversa anda pra direita; a coluna nova tem que entrar em cena sozinha
  useEffect(() => {
    const el = trilho.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [caminho.length]);

  if (!ix.entradas.length) return <>{emptyHint}</>;

  return (
    <div ref={trilho} className={trilhoClasses}>
      {colunas.map((col, nivel) => {
        const paiId = nivel === 0 ? null : caminho[nivel - 1];
        return (
          <div key={nivel} className="flex w-[190px] shrink-0 snap-start flex-col gap-1.5">
            <div className="sticky top-0 flex items-baseline justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>{nivel === 0 ? "abertura" : `passo ${nivel}`}</span>
              <span className="tabular-nums font-normal">{col.opcoes.length}</span>
            </div>
            {col.opcoes.map((n) => (
              <FlowCard key={n.id} node={n} on={col.escolhido === n.id} onClick={() => onPick(nivel, n.id)} />
            ))}
            {columnFooter?.(nivel, paiId)}
          </div>
        );
      })}
    </div>
  );
}

function FlowCard({ node, on, onClick }: { node: FlowNode; on: boolean; onClick: () => void }) {
  const c = KIND_CLASSES[node.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? "clique de novo pra desfazer este passo" : node.fala ?? undefined}
      className={`flex cursor-pointer items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
        on ? c.on : `bg-white dark:bg-zinc-950 ${c.card}`
      }`}
    >
      <span className={`mt-1 size-1.5 shrink-0 rounded-full ${c.dot}`} />
      <span className={`text-xs leading-snug ${on ? "font-semibold" : ""}`}>{node.titulo}</span>
    </button>
  );
}

/** A trilha do caminho percorrido. Clicar num passo volta a conversa pra ele. */
export function FlowTrail({
  ix,
  caminho,
  onJump,
  onReset,
}: {
  ix: FlowIndex;
  caminho: string[];
  onJump: (nivel: number) => void;
  onReset: () => void;
}) {
  if (!caminho.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-zinc-500">
      {caminho.map((id, i) => {
        const n = ix.byId.get(id);
        if (!n) return null;
        return (
          <span key={`${id}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">›</span>}
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`cursor-pointer rounded px-1 hover:bg-zinc-100 hover:underline dark:hover:bg-zinc-800 ${KIND_CLASSES[n.kind].texto}`}
            >
              {n.titulo}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onReset}
        className="ml-1 cursor-pointer text-zinc-400 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
      >
        recomeçar
      </button>
    </div>
  );
}
