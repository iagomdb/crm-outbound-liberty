// Ponte client-side entre o fluxo (aba 🌳 do PitchPanel, onde você navega a
// conversa durante a ligação) e o CallLogForm (que envia o registro): singleton
// do bundle, lido via useSyncExternalStore num hidden input.
//
// Mesma mecânica do abordagem-store, mas o que atravessa aqui é ORDENADO — o
// caminho é uma sequência, e é justamente a ordem que o Aprendizado lê depois
// (onde passou, onde morreu). Zera a cada empresa: o ScriptFlow reseta ao
// montar, keyed por target.

import type { CaminhoStep } from "@/core/script-flow";

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
