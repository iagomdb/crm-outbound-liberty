"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { escolher, indexGraph, KIND_CLASSES, KIND_LABELS, type FlowGraph, type NodeKind } from "@/core/script-flow";
import { Button, Field, Input, Select, Textarea, fieldClasses } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  alternarEntrada,
  apagarNo,
  atualizarNo,
  criarNo,
  desligar,
  ligarExistente,
  moverNo,
  type CriarState,
} from "@/app/campaigns/[slug]/fluxo/actions";
import { FlowColumns, FlowTrail } from "./FlowColumns";

/**
 * Montar o fluxo nas MESMAS colunas em que você vai ligar. Não existe modo
 * "desenho" separado: você navega o script como se estivesse na ligação e edita
 * o passo aberto ali embaixo. O que você vê montando é exatamente o que vai
 * aparecer discando.
 */

const KINDS: NodeKind[] = ["fala", "reacao", "saida"];
const mini =
  "cursor-pointer rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-default disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export function ScriptFlowEditor({ campaignId, graph }: { campaignId: string; graph: FlowGraph }) {
  const ix = useMemo(() => indexGraph(graph), [graph]);
  const [caminhoBruto, setCaminho] = useState<string[]>([]);
  // passo apagado por baixo: o caminho não pode apontar pro vazio. Derivado no
  // render em vez de corrigido num efeito — o grafo novo já chega pelas props.
  const caminho = caminhoBruto.filter((id) => ix.byId.has(id));

  const nivelAtual = caminho.length - 1;
  const atualId = caminho[nivelAtual] ?? null;
  const atual = atualId ? ix.byId.get(atualId) : null;
  const paiDoAtual = nivelAtual > 0 ? caminho[nivelAtual - 1] : null;

  // passos fora de qualquer galho — sem esta lista, tirar um nó do último pai o
  // esconderia pra sempre (ele existe no banco, mas nenhuma coluna chega nele)
  const soltos = graph.nodes.filter((n) => !n.entrada && !(ix.pais.get(n.id)?.length ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <FlowTrail
        ix={ix}
        caminho={caminho}
        onJump={(n) => setCaminho(caminho.slice(0, n + 1))}
        onReset={() => setCaminho([])}
      />

      <FlowColumns
        ix={ix}
        caminho={caminho}
        onPick={(nivel, id) => setCaminho(escolher(caminho, nivel, id))}
        columnFooter={(nivel, paiId) => (
          <NovoNo
            key={`${nivel}-${paiId ?? "raiz"}`}
            campaignId={campaignId}
            paiId={paiId}
            onCriado={(id) => setCaminho([...caminho.slice(0, nivel), id])}
          />
        )}
        emptyHint={
          <div className="w-[190px]">
            <NovoNo campaignId={campaignId} paiId={null} onCriado={(id) => setCaminho([id])} aberto />
          </div>
        }
      />

      {!ix.entradas.length && (
        <p className="text-sm text-zinc-500">
          Comece pelas <strong>aberturas</strong> — cada jeito de entrar na ligação é um card da primeira coluna. Depois
          clique numa e adicione o que ele pode responder.
        </p>
      )}

      {atual && (
        <NoEditor
          key={atual.id}
          node={atual}
          paiId={paiDoAtual}
          paisCount={ix.pais.get(atual.id)?.length ?? 0}
          candidatos={graph.nodes.filter(
            (n) => n.id !== atual.id && !(ix.filhos.get(atual.id) ?? []).some((f) => f.id === n.id),
          )}
          onApagado={() => setCaminho(caminho.slice(0, nivelAtual))}
        />
      )}

      {soltos.length > 0 && (
        <div className="rounded-xl border border-dashed border-amber-300 p-3 dark:border-amber-800">
          <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Passos soltos ({soltos.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Não são abertura e não estão pendurados em ninguém — ninguém chega neles na ligação. Abra um passo acima e
            use “pendurar passo existente”, ou apague.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {soltos.map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-800"
              >
                <span className={`size-1.5 rounded-full ${KIND_CLASSES[n.kind].dot}`} />
                {n.titulo}
                <form action={alternarEntrada.bind(null, campaignId, n.id, true)}>
                  <button type="submit" className={mini} title="virar abertura">
                    ↖ abertura
                  </button>
                </form>
                <form action={apagarNo.bind(null, n.id)}>
                  <button type="submit" className={`${mini} hover:text-red-500`} title="apagar">
                    ✕
                  </button>
                </form>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Criar passo direto no rodapé da coluna — o jeito rápido de despejar um galho inteiro. */
function NovoNo({
  campaignId,
  paiId,
  onCriado,
  aberto = false,
}: {
  campaignId: string;
  paiId: string | null;
  onCriado: (id: string) => void;
  aberto?: boolean;
}) {
  const [aberta, setAberta] = useState(aberto);
  const [state, formAction, pending] = useActionState<CriarState, FormData>(
    criarNo.bind(null, campaignId, paiId),
    {},
  );

  // criou ⇒ abre o passo novo na hora: cria e preenche, sem caçar o card
  useEffect(() => {
    if (state.novoId) onCriado(state.novoId);
    // onCriado muda a cada render do pai; só o id novo deve disparar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.novoId]);

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="cursor-pointer rounded-lg border border-dashed border-zinc-300 px-2 py-1.5 text-left text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
      >
        + {paiId ? "próximo passo" : "abertura"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1 rounded-lg border border-zinc-300 p-1.5 dark:border-zinc-700">
      <input
        name="titulo"
        autoFocus
        required
        placeholder={paiId ? "ex.: A3 · manda no zap" : "ex.: Abertura — contexto nv3"}
        className={`${fieldClasses} text-xs`}
      />
      <select name="kind" defaultValue={paiId ? "reacao" : "fala"} className={`${fieldClasses} text-xs`}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {state.erro && <span className="text-[11px] text-red-500">{state.erro}</span>}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {pending ? "…" : "criar"}
        </button>
        <button type="button" onClick={() => setAberta(false)} className={mini}>
          cancelar
        </button>
      </div>
    </form>
  );
}

/** O passo aberto: conteúdo, posição, e as ligações que saem e chegam nele. */
function NoEditor({
  node,
  paiId,
  paisCount,
  candidatos,
  onApagado,
}: {
  node: FlowGraph["nodes"][number];
  paiId: string | null;
  paisCount: number;
  candidatos: FlowGraph["nodes"];
  onApagado: () => void;
}) {
  const [ligarId, setLigarId] = useState("");
  const c = KIND_CLASSES[node.kind];

  return (
    <div className={`flex flex-col gap-3 rounded-xl border-l-4 border-y border-r p-4 ${c.on}`}>
      <form action={atualizarNo.bind(null, node.id)} className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
          <Field label="Título (o card)">
            <Input name="titulo" required defaultValue={node.titulo} />
          </Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue={node.kind}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Fala" hint="o texto lido em voz alta na ligação — aceita markdown">
          <Textarea name="fala" rows={6} defaultValue={node.fala ?? ""} />
        </Field>
        <Field label="Nota" hint="tom, quando usar, o que NÃO fazer — aparece pequeno abaixo da fala">
          <Input name="nota" defaultValue={node.nota ?? ""} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="entrada" defaultChecked={node.entrada} className="size-4 accent-emerald-600" />
          é uma abertura (aparece na primeira coluna)
        </label>
        <Button type="submit" size="sm" className="self-start">
          Salvar passo
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-current/10 pt-3 text-xs">
        <span className="text-zinc-500">
          {paisCount === 0
            ? node.entrada
              ? "abertura"
              : "solto"
            : `pendurado em ${paisCount} ${paisCount === 1 ? "passo" : "passos"}`}
        </span>

        <span className="flex items-center gap-0.5">
          <form action={moverNo.bind(null, node.id, paiId, -1)}>
            <button type="submit" className={mini} title="subir na coluna">
              ↑
            </button>
          </form>
          <form action={moverNo.bind(null, node.id, paiId, 1)}>
            <button type="submit" className={mini} title="descer na coluna">
              ↓
            </button>
          </form>
        </span>

        <form action={ligarExistente.bind(null, node.id, ligarId)} className="flex items-center gap-1">
          <select
            value={ligarId}
            onChange={(e) => setLigarId(e.target.value)}
            className={`${fieldClasses} max-w-56 py-1 text-xs`}
          >
            <option value="">pendurar passo existente…</option>
            {candidatos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.titulo}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!ligarId} className={mini} title="reusar este passo aqui">
            pendurar
          </button>
        </form>

        {paiId && (
          <form action={desligar.bind(null, paiId, node.id)}>
            <button type="submit" className={mini} title="tira só deste galho — o passo continua existindo">
              tirar deste galho
            </button>
          </form>
        )}

        <form action={apagarNo.bind(null, node.id)} onSubmit={onApagado} className="ml-auto">
          <ConfirmButton
            message={`Apagar "${node.titulo}" de TODOS os galhos? O histórico das ligações que passaram por aqui continua legível.`}
            className={`${mini} hover:text-red-500`}
          >
            apagar passo
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
