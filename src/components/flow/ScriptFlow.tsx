"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { caminhoStore, falaStore } from "@/lib/caminho-store";
import {
  caminhoParaRegistro,
  destinoDe,
  escolher,
  indexGraph,
  type FlowGraph,
  type FlowIndex,
  type Passo,
} from "@/core/script-flow";
import { FlowColumns, FlowTrail } from "./FlowColumns";

/**
 * O fluxo DURANTE a ligação (aba 🌳 do PitchPanel). Você clica a conversa
 * conforme ela acontece: abertura → reação dele → objeção → test drive.
 *
 * Aqui ficam só as colunas. A FALA do passo aberto é publicada no falaStore e
 * desenhada pelo FalaBox, numa caixa larga logo abaixo — texto pra ler em voz
 * alta não cabe espremido ao lado das colunas.
 *
 * O caminho clicado vai junto no registro da ligação (caminhoStore → hidden
 * input do CallLogForm). Não é telemetria: é o que responde depois qual
 * abertura converte e em que passo a conversa morre, sem você digitar nada.
 */
export function ScriptFlow({ graph, editHref }: { graph: FlowGraph; editHref: string | null }) {
  const ix = useMemo(() => indexGraph(graph), [graph]);
  const [caminho, setCaminho] = useState<Passo[]>([]);

  // empresa nova (key por target) ⇒ zera caminho e fala
  useEffect(() => {
    caminhoStore.reset();
    falaStore.set(null);
  }, []);

  const andar = (next: Passo[]) => {
    setCaminho(next);
    caminhoStore.set(caminhoParaRegistro(ix, next));
    falaStore.set(falaDoPasso(ix, next[next.length - 1]));
  };

  if (!ix.entrada || !ix.entrada.opcoes.length) {
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

      <FlowColumns
        ix={ix}
        caminho={caminho}
        onPick={(nivel, menuId, opcaoId) => andar(escolher(caminho, nivel, menuId, opcaoId))}
      />

      {!caminho.length && <p className="text-xs text-zinc-400">Escolha a abertura pela qual você vai entrar.</p>}
    </div>
  );
}

/** O que o FalaBox precisa saber sobre o passo aberto. */
function falaDoPasso(ix: FlowIndex, passo: Passo | undefined) {
  if (!passo) return null;
  const o = ix.opcoes.get(passo.opcaoId);
  if (!o) return null;
  return {
    titulo: o.titulo,
    fala: o.fala,
    nota: o.nota,
    kind: o.kind,
    fimDoGalho: !destinoDe(ix, passo),
  };
}
