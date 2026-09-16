"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { caminhoStore } from "@/lib/caminho-store";
import {
  caminhoParaRegistro,
  escolher,
  indexGraph,
  KIND_CLASSES,
  KIND_LABELS,
  type FlowGraph,
} from "@/core/script-flow";
import { FlowColumns, FlowTrail } from "./FlowColumns";

/**
 * O fluxo DURANTE a ligação (aba 🌳 do PitchPanel). Você clica a conversa
 * conforme ela acontece: abertura → reação dele → objeção → test drive. A fala
 * do passo atual fica embaixo, grande, pra ler em voz alta.
 *
 * O caminho clicado vai junto no registro da ligação (caminhoStore → hidden
 * input do CallLogForm). Não é telemetria: é o que responde depois qual
 * abertura converte e em que frase a conversa morre, sem você digitar nada.
 */
export function ScriptFlow({ graph, editHref }: { graph: FlowGraph; editHref: string | null }) {
  const ix = useMemo(() => indexGraph(graph), [graph]);
  const [caminho, setCaminho] = useState<string[]>([]);

  // empresa nova (key por target) ⇒ zera o caminho que iria pro registro
  useEffect(() => {
    caminhoStore.reset();
  }, []);

  const andar = (next: string[]) => {
    setCaminho(next);
    caminhoStore.set(caminhoParaRegistro(ix, next));
  };

  const atual = caminho.length ? ix.byId.get(caminho[caminho.length - 1]) : null;
  const semSaida = atual && !(ix.filhos.get(atual.id)?.length ?? 0);

  if (!ix.entradas.length) {
    return (
      <p className="text-sm text-zinc-400">
        Esta carteira ainda não tem fluxo.{" "}
        {editHref && (
          <Link href={editHref} className="text-sky-600 hover:underline dark:text-sky-400">
            montar o fluxo →
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FlowTrail ix={ix} caminho={caminho} onJump={(n) => andar(caminho.slice(0, n + 1))} onReset={() => andar([])} />

      <FlowColumns ix={ix} caminho={caminho} onPick={(nivel, id) => andar(escolher(caminho, nivel, id))} />

      {atual ? (
        <div className={`rounded-lg border-l-4 py-2 pl-3 ${KIND_CLASSES[atual.kind].on}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">{atual.titulo}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">
              {KIND_LABELS[atual.kind]}
            </span>
          </div>
          {atual.fala ? (
            <div className="mt-1 text-sm leading-relaxed">
              <Markdown text={atual.fala} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">Sem fala escrita — este nó só ramifica.</p>
          )}
          {atual.nota && (
            <p className="mt-2 border-t border-current/10 pt-1.5 text-xs italic text-zinc-500">{atual.nota}</p>
          )}
          {semSaida && (
            <p className="mt-2 text-[11px] text-zinc-400">
              Fim do galho — registre a ligação ou clique num passo da trilha pra voltar.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Escolha a abertura pela qual você vai entrar.</p>
      )}
    </div>
  );
}
