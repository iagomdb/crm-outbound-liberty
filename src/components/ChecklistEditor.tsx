"use client";

import { useState } from "react";
import { fieldClasses } from "@/components/ui";

// Editor dos itens do checklist da carteira (dentro do form de criar/editar).
// Item simples = checkbox na ligação. Item com VARIAÇÕES vira uma categoria:
// na ligação escolhe-se qual variação foi usada (teste A/B de abordagem).
// Serializa tudo num hidden input "checklistItems" — a action faz replace-all.

export type ChecklistDraft = { titulo: string; descricao: string; opcoes: string[] };

const btn =
  "cursor-pointer rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-default dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export function ChecklistEditor({ initialItems }: { initialItems: ChecklistDraft[] }) {
  const [items, setItems] = useState<ChecklistDraft[]>(initialItems);

  const patch = (i: number, p: Partial<ChecklistDraft>) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...p } : item)));

  const move = (i: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const setOpcao = (i: number, oi: number, value: string) =>
    patch(i, { opcoes: items[i].opcoes.map((o, idx) => (idx === oi ? value : o)) });

  // só itens com título contam — vazios (item ou variação) são descartados no save
  const serialized = JSON.stringify(
    items
      .filter((i) => i.titulo.trim())
      .map((i) => ({
        titulo: i.titulo.trim(),
        descricao: i.descricao.trim(),
        opcoes: i.opcoes.map((o) => o.trim()).filter(Boolean),
      })),
  );

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="checklistItems" value={serialized} />

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-400 dark:border-zinc-700">
          Nenhum item ainda. Item simples vira um objetivo marcável; item com variações vira uma categoria de escolha
          (ex.: “Abertura” com 2 versões pra testar).
        </p>
      )}

      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <span className="mt-2 w-5 text-right text-xs tabular-nums text-zinc-400">{i + 1}.</span>
          <div className="flex flex-1 flex-col gap-1.5">
            <input
              value={item.titulo}
              onChange={(e) => patch(i, { titulo: e.target.value })}
              placeholder="objetivo ou categoria (ex.: Abertura)"
              className={fieldClasses}
            />
            <input
              value={item.descricao}
              onChange={(e) => patch(i, { descricao: e.target.value })}
              placeholder="detalhe opcional"
              className={`${fieldClasses} text-xs`}
            />

            {/* variações: transformam o item em categoria de escolha única */}
            {item.opcoes.map((o, oi) => (
              <div key={oi} className="ml-4 flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">◦</span>
                <input
                  value={o}
                  onChange={(e) => setOpcao(i, oi, e.target.value)}
                  placeholder={`variação ${oi + 1} (ex.: Abertura direta)`}
                  className={`${fieldClasses} text-xs`}
                />
                <button
                  type="button"
                  onClick={() => patch(i, { opcoes: item.opcoes.filter((_, idx) => idx !== oi) })}
                  className={`${btn} hover:text-red-500 dark:hover:text-red-400`}
                  title="remover variação"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch(i, { opcoes: [...item.opcoes, ""] })}
              className="ml-4 cursor-pointer self-start text-xs text-zinc-400 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
            >
              + variação {item.opcoes.length === 0 ? "(vira categoria de escolha)" : ""}
            </button>
          </div>
          <div className="flex flex-col">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btn} title="subir">
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className={btn}
              title="descer"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              className={`${btn} hover:text-red-500 dark:hover:text-red-400`}
              title="remover"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, { titulo: "", descricao: "", opcoes: [] }])}
        className="cursor-pointer self-start rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
      >
        + adicionar item
      </button>
    </div>
  );
}
