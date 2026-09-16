"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { colunasDoCaminho, KIND_CLASSES, type FlowIndex, type FlowOption, type Passo } from "@/core/script-flow";

/**
 * As colunas do FLUXO — cada coluna é um MENU, cada card é uma opção dele.
 * É a visão em colunas do Finder: escolher uma opção abre o menu de destino
 * na coluna seguinte.
 *
 * Por que colunas e não o canvas, aqui: numa ligação você não tem mão pra
 * arrastar e dar zoom. Precisa de alvo de clique parado no mesmo lugar e de um
 * scroll só, horizontal, que anda sozinho conforme a conversa avança. O canvas
 * é pra MONTAR o fluxo; a coluna é pra USAR.
 */

export function FlowColumns({
  ix,
  caminho,
  onPick,
  emptyHint,
}: {
  ix: FlowIndex;
  caminho: Passo[];
  onPick: (nivel: number, menuId: string, opcaoId: string) => void;
  emptyHint?: ReactNode;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const colunas = colunasDoCaminho(ix, caminho);

  // a conversa anda pra direita; a coluna nova tem que entrar em cena sozinha
  useEffect(() => {
    const el = trilho.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [caminho.length]);

  if (!colunas.length) return <>{emptyHint}</>;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] snap-x snap-mandatory sm:snap-none" ref={trilho}>
      {colunas.map((col, nivel) => (
        <div key={`${col.menu.id}-${nivel}`} className="flex w-[190px] shrink-0 snap-start flex-col gap-1.5">
          <div className="flex items-baseline justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            <span className="truncate" title={col.menu.nome}>
              {col.menu.nome}
            </span>
            <span className="tabular-nums font-normal">{col.menu.opcoes.length}</span>
          </div>
          {col.menu.opcoes.map((o) => (
            <FlowCard
              key={o.id}
              opcao={o}
              on={col.escolhida === o.id}
              onClick={() => onPick(nivel, col.menu.id, o.id)}
            />
          ))}
          {col.menu.opcoes.length === 0 && (
            <p className="px-0.5 text-[11px] leading-tight text-zinc-400">menu vazio</p>
          )}
        </div>
      ))}
    </div>
  );
}

function FlowCard({ opcao, on, onClick }: { opcao: FlowOption; on: boolean; onClick: () => void }) {
  const c = KIND_CLASSES[opcao.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? "clique de novo pra desfazer este passo" : (opcao.fala ?? undefined)}
      className={`flex cursor-pointer items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
        on ? c.on : `bg-white dark:bg-zinc-950 ${c.card}`
      }`}
    >
      <span className={`mt-1 size-1.5 shrink-0 rounded-full ${c.dot}`} />
      <span className={`text-xs leading-snug ${on ? "font-semibold" : ""}`}>{opcao.titulo}</span>
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
  caminho: Passo[];
  onJump: (nivel: number) => void;
  onReset: () => void;
}) {
  if (!caminho.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-zinc-500">
      {caminho.map((passo, i) => {
        const o = ix.opcoes.get(passo.opcaoId);
        if (!o) return null;
        return (
          <span key={`${passo.opcaoId}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">›</span>}
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`cursor-pointer rounded px-1 hover:bg-zinc-100 hover:underline dark:hover:bg-zinc-800 ${KIND_CLASSES[o.kind].texto}`}
            >
              {o.titulo}
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
