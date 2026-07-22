// Ponte client-side entre o PitchPanel (onde se escolhe a variação de
// abordagem — ex.: qual abertura usou) e o CallLogForm (que envia a ligação):
// singleton do bundle, lido via useSyncExternalStore num hidden input.
// Zera a cada empresa (o PitchPanel reseta ao montar, keyed por target).

export type Abordagem = { itemId: string; categoria: string; opcao: string };

let selections = new Map<string, Abordagem>();
let snapshot = "[]";
const listeners = new Set<() => void>();

function emit() {
  snapshot = JSON.stringify([...selections.values()]);
  listeners.forEach((l) => l());
}

export const abordagemStore = {
  reset() {
    selections = new Map();
    emit();
  },
  set(a: Abordagem) {
    selections.set(a.itemId, a);
    emit();
  },
  clear(itemId: string) {
    if (selections.delete(itemId)) emit();
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
