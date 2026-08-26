"use client";

import { useRef } from "react";
import { trocarConta } from "@/app/conta-actions";
import { TODAS_LABEL } from "@/lib/conta";

/**
 * Seletor da conta ativa no header. Troca = submit imediato (server action
 * grava o cookie e revalida o layout inteiro).
 */
export function ContaSwitcher({ contas, ativa }: { contas: string[]; ativa: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  if (contas.length === 0) return null;

  return (
    <form ref={form} action={trocarConta}>
      <select
        name="conta"
        defaultValue={ativa ?? ""}
        onChange={() => form.current?.requestSubmit()}
        title="conta ativa — filtra fila, agenda, roleta e contadores"
        aria-label="Conta ativa"
        className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="">{TODAS_LABEL}</option>
        {contas.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </form>
  );
}
