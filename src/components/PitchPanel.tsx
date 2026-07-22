"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

// Painel da direita na tela de discagem: aba 📜 Pitch (script renderizado,
// vem pronto do server) e aba ✅ Checklist (objetivos da ligação, marcáveis).
// O estado dos checks é só da tela — cada empresa nova começa zerada (key por
// target na página).

type ChecklistEntry = { kind: "header" | "item"; text: string; idx: number };

/** Uma linha por objetivo; linhas começando com # viram seção. */
function parseChecklist(raw: string): ChecklistEntry[] {
  let idx = 0;
  return raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((text) =>
      text.startsWith("#")
        ? { kind: "header" as const, text: text.replace(/^#+\s*/, ""), idx: -1 }
        : { kind: "item" as const, text, idx: idx++ },
    );
}

const tabClasses = (active: boolean) =>
  `cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
  }`;

export function PitchPanel({
  campaignName,
  editHref,
  checklist,
  hasScript,
  children,
}: {
  campaignName: string;
  editHref: string | null;
  checklist: string | null;
  hasScript: boolean;
  /** o pitch já renderizado (Markdown é server component) */
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"pitch" | "checklist">("pitch");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const entries = checklist ? parseChecklist(checklist) : [];
  const totalItems = entries.filter((e) => e.kind === "item").length;

  const toggle = (idx: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const editLink = editHref && (
    <Link href={editHref} className="text-xs text-sky-600 hover:underline dark:text-sky-400">
      editar →
    </Link>
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
        <button type="button" className={tabClasses(tab === "pitch")} onClick={() => setTab("pitch")}>
          📜 Pitch
        </button>
        <button type="button" className={tabClasses(tab === "checklist")} onClick={() => setTab("checklist")}>
          ✅ Checklist{totalItems > 0 ? ` ${checked.size}/${totalItems}` : ""}
        </button>
        <span className="ml-auto truncate text-xs text-zinc-400">{campaignName}</span>
      </div>

      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5">
        {tab === "pitch" &&
          (hasScript ? (
            children
          ) : (
            <p className="text-sm text-zinc-400">Esta carteira ainda não tem pitch. {editLink}</p>
          ))}

        {tab === "checklist" &&
          (totalItems === 0 ? (
            <p className="text-sm text-zinc-400">Esta carteira ainda não tem checklist. {editLink}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {entries.map((e, i) =>
                e.kind === "header" ? (
                  <div
                    key={i}
                    className="mt-3 mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500 first:mt-0"
                  >
                    {e.text}
                  </div>
                ) : (
                  <label
                    key={i}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(e.idx)}
                      onChange={() => toggle(e.idx)}
                      className="mt-0.5 size-4 accent-emerald-600"
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        checked.has(e.idx) ? "text-zinc-400 line-through" : ""
                      }`}
                    >
                      {e.text}
                    </span>
                  </label>
                ),
              )}
              {checked.size > 0 && (
                <button
                  type="button"
                  onClick={() => setChecked(new Set())}
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
