"use client";

import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { DEATH_CLASSES, deathFor, deathLabel } from "@/core/death";
import { Input } from "@/components/ui";

export type BoardItem = {
  id: string;
  company: string;
  cnpj: string;
  uf: string | null;
  phone: string | null;
  attempts: number;
  stageChangedAt: string; // ISO
  nextActionPretext: string | null;
};

export type BoardColumn = { stage: string; label: string; items: BoardItem[] };

type MoveMsg = { id: string; toStage: string };
type StageOption = { stage: string; label: string };

export function KanbanBoard({
  columns,
  moveAction,
  archiveAction,
}: {
  columns: BoardColumn[];
  moveAction: (id: string, stage: string) => Promise<void>;
  archiveAction: (id: string, reason: string) => Promise<void>;
}) {
  const [cols, applyMove] = useOptimistic(columns, (state: BoardColumn[], { id, toStage }: MoveMsg) => {
    let moved: BoardItem | undefined;
    const stripped = state.map((c) => ({
      ...c,
      items: c.items.filter((it) => {
        if (it.id === id) {
          moved = it;
          return false;
        }
        return true;
      }),
    }));
    return stripped.map((c) => (c.stage === toStage && moved ? { ...c, items: [moved, ...c.items] } : c));
  });
  const [q, setQ] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function moveTo(id: string, toStage: string) {
    const from = cols.find((c) => c.items.some((it) => it.id === id));
    if (!from || from.stage === toStage) return;
    startTransition(async () => {
      applyMove({ id, toStage });
      await moveAction(id, toStage);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const toStage = e.over ? String(e.over.id) : null;
    if (!toStage) return;
    moveTo(String(e.active.id), toStage);
  }

  const stageOptions: StageOption[] = cols.map((c) => ({ stage: c.stage, label: c.label }));

  // busca client-side: com 100+ cards numa coluna, achar uma empresa rolando é inviável
  const norm = q.trim().toLowerCase();
  const view = cols.map((c) => ({
    ...c,
    total: c.items.length,
    items: norm
      ? c.items.filter((it) =>
          `${it.company} ${it.cnpj} ${it.nextActionPretext ?? ""}`.toLowerCase().includes(norm),
        )
      : c.items,
  }));

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 filtrar por empresa, CNPJ ou pretexto…"
        className="w-72"
      />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {view.map((col) => (
            <Column key={col.stage} col={col} stageOptions={stageOptions} onMove={moveTo} archiveAction={archiveAction} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  col,
  stageOptions,
  onMove,
  archiveAction,
}: {
  col: BoardColumn & { total: number };
  stageOptions: StageOption[];
  onMove: (id: string, stage: string) => void;
  archiveAction: (id: string, reason: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex max-h-[70vh] w-64 shrink-0 flex-col rounded-xl border bg-zinc-50 p-2 dark:bg-zinc-900/50 ${
        isOver ? "border-sky-400 ring-2 ring-sky-400/40" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-2 text-xs font-semibold">
        <span>{col.label}</span>
        <span className="rounded bg-zinc-200 px-1.5 text-zinc-500 dark:bg-zinc-800">
          {col.items.length !== col.total ? `${col.items.length}/${col.total}` : col.total}
        </span>
      </div>
      {/* a coluna rola sozinha — a página não vira uma lista de 100+ cards */}
      <div className="flex min-h-8 flex-col gap-2 overflow-y-auto pr-0.5">
        {col.items.map((it) => (
          <Card key={it.id} item={it} stage={col.stage} stageOptions={stageOptions} onMove={onMove} archiveAction={archiveAction} />
        ))}
      </div>
    </div>
  );
}

function Card({
  item,
  stage,
  stageOptions,
  onMove,
  archiveAction,
}: {
  item: BoardItem;
  stage: string;
  stageOptions: StageOption[];
  onMove: (id: string, stage: string) => void;
  archiveAction: (id: string, reason: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const d = deathFor({ attempts: item.attempts, stageChangedAt: item.stageChangedAt });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab touch-none px-0.5 text-zinc-300 hover:text-zinc-500"
          aria-label="arrastar"
        >
          ⠿
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/targets/${item.id}`} className="block truncate text-sm font-medium hover:underline">
            {item.company}
          </Link>
          <div className="truncate text-xs text-zinc-400">
            {item.cnpj}
            {item.uf ? ` · ${item.uf}` : ""}
          </div>
          {item.nextActionPretext && (
            <div className="mt-0.5 truncate text-xs text-zinc-500">↪ {item.nextActionPretext}</div>
          )}
        </div>
      </div>

      {/* medidor de morte */}
      <div className="mt-2">
        <div className="h-1 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div className={`h-1 rounded ${DEATH_CLASSES[d.state].bar}`} style={{ width: `${Math.round(d.score * 100)}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
          <span className={`truncate ${DEATH_CLASSES[d.state].text}`}>
            {item.attempts} tent · {d.daysStalled}d · {deathLabel(d)}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {d.state !== "ok" && (
              <button
                onClick={() => {
                  if (confirm(`Arquivar "${item.company}"?`)) {
                    startTransition(() => {
                      void archiveAction(item.id, "morte: cadência/tempo esgotado");
                    });
                  }
                }}
                className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-400"
              >
                arquivar
              </button>
            )}
            {/* mover sem arrastar — com colunas longas, drag até o destino é penoso */}
            <select
              value=""
              onChange={(e) => e.target.value && onMove(item.id, e.target.value)}
              className="cursor-pointer rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950"
              aria-label="mover para outro estágio"
            >
              <option value="">mover ➜</option>
              {stageOptions
                .filter((s) => s.stage !== stage)
                .map((s) => (
                  <option key={s.stage} value={s.stage}>
                    {s.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
