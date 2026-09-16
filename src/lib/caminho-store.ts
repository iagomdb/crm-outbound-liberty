// Pontes client-side entre o fluxo (aba 🌳 do PitchPanel) e o resto da tela de
// discagem. São dois singletons de bundle, lidos via useSyncExternalStore:
//
//   caminhoStore → o caminho percorrido, que vai no hidden input do CallLogForm
//                  e vira estatística depois (activities.caminho)
//   falaStore    → a fala do passo atual, que é desenhada FORA do painel, num
//                  box próprio embaixo dele
//
// O falaStore existe porque a fala precisa de uma caixa larga e separada, e o
// componente que sabe qual passo está aberto vive dentro do painel. Em vez de
// levantar o estado até a página (que é Server Component), o painel publica e o
// box escuta.
//
// Os dois zeram a cada empresa: o ScriptFlow reseta ao montar, keyed por target.

import type { CaminhoStep, NodeKind } from "@/core/script-flow";

let passos: CaminhoStep[] = [];
let snapshot = "[]";
const listeners = new Set<() => void>();

function emit() {
  snapshot = JSON.stringify(passos);
  listeners.forEach((l) => l());
}

export const caminhoStore = {
  reset() {
    passos = [];
    emit();
  },
  set(next: CaminhoStep[]) {
    passos = next;
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getSnapshot() {
    return snapshot;
  },
};

export type FalaAtual = {
  titulo: string;
  fala: string | null;
  nota: string | null;
  kind: NodeKind;
  /** o passo não leva a lugar nenhum — fim do galho */
  fimDoGalho: boolean;
} | null;

// a referência só muda no set, que é o que o useSyncExternalStore exige
let atual: FalaAtual = null;
const falaListeners = new Set<() => void>();

export const falaStore = {
  set(next: FalaAtual) {
    atual = next;
    falaListeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    falaListeners.add(fn);
    return () => {
      falaListeners.delete(fn);
    };
  },
  getSnapshot() {
    return atual;
  },
  /** no servidor não há passo escolhido — o box só aparece depois do clique */
  getServerSnapshot(): FalaAtual {
    return null;
  },
};
