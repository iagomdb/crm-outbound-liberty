"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { abordagemStore } from "@/lib/abordagem-store";

// Painel das telas de ligação (fila e target): aba 📜 Pitch (script renderizado,
// vem pronto do server) e aba ✅ Checklist. Item simples = marcável; item com
// variações = CATEGORIA: escolher qual variação usou completa e colapsa o grupo,
// e a escolha vai junto no registro da ligação (via abordagemStore) pro A/B.
// Estado é só da tela — cada empresa nova começa zerada (key por target).

export type ChecklistItemView = {
  id: string;
  titulo: string;
  descricao: string | null;
  opcoes: { id: string; titulo: string }[];
};

const tabClasses = (active: boolean) =>
  `cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
  }`;

export function PitchPanel({
  campaignName,
  editHref,
  items,
  hasScript,
  contentMaxH = "max-h-[calc(100vh-10rem)]",
  children,
}: {
  campaignName: string;
  editHref: string | null;
  items: ChecklistItemView[];
  hasScript: boolean;
  /** altura máxima do conteúdo (a tela do target divide a coluna com o form de ligação) */
  contentMaxH?: string;
  /** o pitch já renderizado (Markdown é server component) */
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"pitch" | "checklist">("pitch");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // categoria (item com variações) → id da opção escolhida
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());

  // empresa nova (key por target) ⇒ zera as abordagens que iriam pro registro
  useEffect(() => {
    abordagemStore.reset();
  }, []);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const choose = (item: ChecklistItemView, opcaoId: string) => {
    const opcao = item.opcoes.find((o) => o.id === opcaoId);
    if (!opcao) return;
    setChosen((prev) => new Map(prev).set(item.id, opcaoId));
    abordagemStore.set({ itemId: item.id, categoria: item.titulo, opcao: opcao.titulo });
  };

  const unchoose = (itemId: string) => {
    setChosen((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
    abordagemStore.clear(itemId);
  };

  const doneCount = checked.size + [...chosen.keys()].length;

  const editLink = editHref && (
    <Link href={editHref} className="text-xs text-sky-600 hover:underline dark:text-sky-400">
      editar carteira →
    </Link>
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
        <button type="button" className={tabClasses(tab === "pitch")} onClick={() => setTab("pitch")}>
          📜 Pitch
        </button>
        <button type="button" className={tabClasses(tab === "checklist")} onClick={() => setTab("checklist")}>
          ✅ Checklist{items.length > 0 ? ` ${doneCount}/${items.length}` : ""}
        </button>
        <span className="ml-auto truncate text-xs text-zinc-400">{campaignName}</span>
      </div>

      <div className={`${contentMaxH} overflow-y-auto p-5`}>
        {tab === "pitch" &&
          (hasScript ? (
            children
          ) : (
            <p className="text-sm text-zinc-400">Esta carteira ainda não tem pitch. {editLink}</p>
          ))}

        {tab === "checklist" &&
          (items.length === 0 ? (
            <p className="text-sm text-zinc-400">Esta carteira ainda não tem checklist. {editLink}</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                // item com variações = categoria: escolher uma completa e colapsa
                if (item.opcoes.length > 0) {
                  const chosenId = chosen.get(item.id);
                  const chosenOpt = item.opcoes.find((o) => o.id === chosenId);
                  if (chosenOpt) {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2 py-2 dark:bg-emerald-950"
                      >
                        <span className="text-sm text-emerald-800 dark:text-emerald-200">
                          ✓ {item.titulo} — <strong>{chosenOpt.titulo}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => unchoose(item.id)}
                          className="cursor-pointer text-xs text-emerald-700 hover:underline dark:text-emerald-300"
                        >
                          trocar
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={item.id} className="rounded-lg border border-zinc-200 px-2 py-2 dark:border-zinc-800">
                      <div className="text-sm font-medium">{item.titulo}</div>
                      {item.descricao && <div className="text-xs text-zinc-500">{item.descricao}</div>}
                      <div className="mt-1.5 flex flex-col gap-1">
                        {item.opcoes.map((o) => (
                          <label
                            key={o.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          >
                            <input
                              type="radio"
                              name={`cat_${item.id}`}
                              onChange={() => choose(item, o.id)}
                              className="size-4 accent-emerald-600"
                            />
                            <span className="text-sm">{o.titulo}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                }

                const done = checked.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-4 accent-emerald-600"
                    />
                    <span className="flex flex-col">
                      <span className={`text-sm leading-snug ${done ? "text-zinc-400 line-through" : ""}`}>
                        {item.titulo}
                      </span>
                      {item.descricao && (
                        <span className={`text-xs leading-snug ${done ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500"}`}>
                          {item.descricao}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setChecked(new Set());
                    setChosen(new Map());
                    abordagemStore.reset();
                  }}
                  className="mt-3 cursor-pointer self-start text-xs text-zinc-400 hover:underline"
                >
                  limpar marcados
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
