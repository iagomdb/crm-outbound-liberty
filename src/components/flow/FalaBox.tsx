"use client";

import { useSyncExternalStore } from "react";
import { Markdown } from "@/components/Markdown";
import { falaStore } from "@/lib/caminho-store";
import { KIND_CLASSES, KIND_LABELS } from "@/core/script-flow";

/**
 * A fala do passo aberto, numa caixa própria abaixo do fluxo.
 *
 * Mora fora do painel de propósito: é o texto que você lê em voz alta, então
 * precisa de largura e de altura próprias, sem disputar espaço com as colunas
 * nem obrigar a rolar o painel no meio da ligação.
 *
 * Só aparece depois que você escolhe um passo — antes disso não ocupa espaço.
 */
export function FalaBox() {
  const atual = useSyncExternalStore(falaStore.subscribe, falaStore.getSnapshot, falaStore.getServerSnapshot);
  if (!atual) return null;

  const c = KIND_CLASSES[atual.kind];
  return (
    <section className={`rounded-xl border-l-4 border-y border-r px-4 py-3 ${c.on}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{atual.titulo}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">{KIND_LABELS[atual.kind]}</span>
      </div>

      {atual.fala ? (
        <div className="mt-1.5 max-w-4xl text-base leading-relaxed">
          <Markdown text={atual.fala} />
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-zinc-400">Sem fala escrita — esta opção só ramifica.</p>
      )}

      {atual.nota && (
        <p className="mt-2 max-w-4xl border-t border-current/10 pt-2 text-xs italic text-zinc-500">{atual.nota}</p>
      )}

      {atual.fimDoGalho && (
        <p className="mt-2 text-xs text-zinc-400">
          Fim do galho — registre a ligação ou clique num passo da trilha pra voltar.
        </p>
      )}
    </section>
  );
}
