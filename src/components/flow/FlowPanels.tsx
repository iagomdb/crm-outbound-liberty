"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PendingButton, PendingNote } from "@/components/PendingButton";
import { KIND_LABELS, type FlowMenu, type FlowOption, type NodeKind } from "@/core/script-flow";
import {
  adicionarExistente,
  apagarMenu,
  apagarOpcao,
  atualizarOpcao,
  criarOpcao,
  definirDestinoOpcao,
  definirEntradaMenu,
  definirPadrao,
  duplicarMenuAction,
  duplicarOpcaoAction,
  fundirOpcaoAction,
  moverOpcao,
  removerDoMenu,
  renomearMenu,
  type CriarState,
} from "@/app/campaigns/[slug]/fluxo/actions";

/**
 * Os painéis laterais do canvas. O card no canvas mostra a ESTRUTURA; o texto
 * (que é longo) vive aqui do lado, pra não inflar o card nem obrigar zoom.
 */

const KINDS: NodeKind[] = ["fala", "reacao", "saida"];
const mini =
  "cursor-pointer rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-default disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const caixa = "flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950";

/**
 * Textarea que salva com Enter, como num chat — Shift+Enter quebra linha.
 *
 * Nos campos de uma linha o Enter já submetia sozinho (submissão implícita do
 * form); só a fala obrigava a caçar o botão Salvar a cada frase. Mantém o
 * Shift+Enter porque as falas do playbook têm parágrafo e citação, e Enter puro
 * salvando sem alternativa tornaria isso impossível de escrever.
 *
 * `isComposing` fica de fora: com teclado de acentuação/IME, o Enter que fecha
 * a composição não é um Enter de verdade.
 */
function FalaTextarea(props: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      {...props}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

function Cabecalho({ titulo, onFechar }: { titulo: string; onFechar: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{titulo}</h3>
      <button type="button" onClick={onFechar} className={mini}>
        fechar
      </button>
    </div>
  );
}

/** Select de menu de destino, compartilhado pelo padrão e pelo destino da opção. */
function SelectMenu({
  menus,
  valor,
  onChange,
  rotuloVazio,
  excluir,
}: {
  menus: FlowMenu[];
  valor: string;
  onChange: (v: string) => void;
  rotuloVazio: string;
  excluir?: string;
}) {
  return (
    <Select value={valor} onChange={(e) => onChange(e.target.value)} className="py-1 text-xs">
      <option value="">{rotuloVazio}</option>
      {menus
        .filter((m) => m.id !== excluir)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
    </Select>
  );
}

export function OpcaoPanel(
  props:
    | {
        modo: "criar";
        campaignId: string;
        menuId: string;
        menus: FlowMenu[];
        todasOpcoes: FlowOption[];
        onFechar: () => void;
      }
    | {
        modo: "editar";
        campaignId: string;
        menuId: string;
        opcao: FlowOption;
        menus: FlowMenu[];
        todasOpcoes: FlowOption[];
        emQuantosMenus: number;
        onFechar: () => void;
      },
) {
  if (props.modo === "criar") return <NovaOpcao {...props} />;
  return <EditarOpcao {...props} />;
}

function NovaOpcao({
  campaignId,
  menuId,
  todasOpcoes,
  onFechar,
}: {
  campaignId: string;
  menuId: string;
  todasOpcoes: FlowOption[];
  onFechar: () => void;
}) {
  const [state, formAction, pending] = useActionState<CriarState, FormData>(
    criarOpcao.bind(null, campaignId, menuId),
    {},
  );
  const [reusarId, setReusarId] = useState("");

  return (
    <div className={caixa}>
      <Cabecalho titulo="Nova opção" onFechar={onFechar} />
      <form action={formAction} className="flex flex-col gap-2">
        <Input name="titulo" autoFocus required placeholder="ex.: A3 · manda no zap" className="text-xs" />
        <Select name="kind" defaultValue="reacao" className="py-1 text-xs">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        {state.erro && <span className="text-[11px] text-red-500">{state.erro}</span>}
        <Button type="submit" size="sm" disabled={pending} className="self-start">
          {pending ? "criando…" : "criar opção"}
        </Button>
      </form>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-900">
        <span className="text-[11px] text-zinc-500">ou reusar uma que já existe (a MESMA opção, não uma cópia)</span>
        <form action={adicionarExistente.bind(null, menuId, reusarId)} className="flex items-center gap-1">
          <Select value={reusarId} onChange={(e) => setReusarId(e.target.value)} className="py-1 text-xs">
            <option value="">escolher opção…</option>
            {todasOpcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo}
              </option>
            ))}
          </Select>
          <button type="submit" disabled={!reusarId} className={mini}>
            reusar
          </button>
        </form>
      </div>
    </div>
  );
}

function EditarOpcao({
  menuId,
  opcao,
  menus,
  todasOpcoes,
  emQuantosMenus,
  onFechar,
}: {
  campaignId: string;
  menuId: string;
  opcao: FlowOption;
  menus: FlowMenu[];
  todasOpcoes: FlowOption[];
  emQuantosMenus: number;
  onFechar: () => void;
}) {
  const [fundirId, setFundirId] = useState("");
  const menu = menus.find((m) => m.id === menuId);
  const padrao = menu?.padraoId ? menus.find((m) => m.id === menu.padraoId)?.nome : null;

  return (
    <div className={caixa}>
      <Cabecalho titulo="Opção" onFechar={onFechar} />

      <form action={atualizarOpcao.bind(null, opcao.id)} className="flex flex-col gap-2">
        <Field label="Título (o card)">
          <Input name="titulo" required defaultValue={opcao.titulo} className="text-xs" />
        </Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue={opcao.kind} className="py-1 text-xs">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fala" hint="aceita markdown · Enter salva, Shift+Enter quebra linha">
          <FalaTextarea name="fala" rows={7} defaultValue={opcao.fala ?? ""} className="text-xs" />
        </Field>
        <Field label="Nota" hint="tom, quando usar, o que não fazer">
          <Input name="nota" defaultValue={opcao.nota ?? ""} className="text-xs" />
        </Field>
        <div className="flex items-center gap-2">
          <PendingButton size="sm" pendingText="salvando…">
            Salvar
          </PendingButton>
          <PendingNote>gravando a fala…</PendingNote>
        </div>
      </form>

      <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-900">
        <span className="text-zinc-500">Destino desta opção</span>
        <SelectMenu
          menus={menus}
          valor={opcao.proximoId ?? ""}
          onChange={(v) => void definirDestinoOpcao(opcao.id, v || null)}
          rotuloVazio={padrao ? `seguir o padrão do menu (${padrao})` : "seguir o padrão do menu (nenhum)"}
        />
        <span className="text-[10px] leading-tight text-zinc-400">
          Deixe no padrão sempre que der — é o que faz a próxima variação não custar ligação nenhuma.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-900">
        <span className="text-zinc-500">
          {emQuantosMenus > 1 ? `usada em ${emQuantosMenus} menus` : "usada em 1 menu"}
        </span>
        <form action={moverOpcao.bind(null, menuId, opcao.id, -1)}>
          <button type="submit" className={mini} title="subir no menu">
            ↑
          </button>
        </form>
        <form action={moverOpcao.bind(null, menuId, opcao.id, 1)}>
          <button type="submit" className={mini} title="descer no menu">
            ↓
          </button>
        </form>
        <form action={duplicarOpcaoAction.bind(null, menuId, opcao.id)}>
          <button type="submit" className={mini} title="outra redação, mesmo menu, mesmo destino">
            ⧉ variação
          </button>
        </form>
        <form action={removerDoMenu.bind(null, menuId, opcao.id)}>
          <button type="submit" className={mini} title="tira só deste menu — continua existindo nos outros">
            tirar do menu
          </button>
        </form>
        <form action={apagarOpcao.bind(null, opcao.id)} onSubmit={onFechar}>
          <ConfirmButton
            message={`Apagar "${opcao.titulo}" de TODOS os menus? O histórico das ligações continua legível.`}
            className={`${mini} hover:text-red-500`}
          >
            apagar
          </ConfirmButton>
        </form>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-900">
        <span className="text-[11px] text-zinc-500">é o mesmo que outra opção? funde as duas numa só</span>
        <form
          action={fundirOpcaoAction.bind(null, opcao.id, fundirId)}
          onSubmit={() => setFundirId("")}
          className="flex items-center gap-1"
        >
          <Select value={fundirId} onChange={(e) => setFundirId(e.target.value)} className="py-1 text-xs">
            <option value="">escolher opção…</option>
            {todasOpcoes
              .filter((o) => o.id !== opcao.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
          </Select>
          <ConfirmButton
            message={`Fundir a opção escolhida nesta?\n\nEla DEIXA DE EXISTIR: passa a aparecer nos menus dela como "${opcao.titulo}", e o texto dela se perde. O histórico é remapeado, então o Aprendizado conta as duas juntas.`}
            className={`${mini} ${fundirId ? "hover:text-amber-600" : "pointer-events-none opacity-30"}`}
          >
            fundir
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}

export function MenuPanel({
  campaignId,
  menu,
  menus,
  todasOpcoes,
  onFechar,
}: {
  campaignId: string;
  menu: FlowMenu;
  menus: FlowMenu[];
  todasOpcoes: FlowOption[];
  onFechar: () => void;
}) {
  const [reusarId, setReusarId] = useState("");

  return (
    <div className={caixa}>
      <Cabecalho titulo="Menu" onFechar={onFechar} />

      <form action={renomearMenu.bind(null, menu.id)} className="flex items-end gap-1">
        <Field label="Nome" className="flex-1">
          <Input name="nome" required defaultValue={menu.nome} className="text-xs" />
        </Field>
        <Button type="submit" size="sm">
          Salvar
        </Button>
      </form>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-900">
        <span className="text-zinc-500">Destino padrão (o “Default”)</span>
        <SelectMenu
          menus={menus}
          valor={menu.padraoId ?? ""}
          onChange={(v) => void definirPadrao(menu.id, v || null)}
          rotuloVazio="nenhum — fim do galho"
          excluir={menu.id}
        />
        <span className="text-[10px] leading-tight text-zinc-400">
          Vale pra toda opção sem destino próprio. Mudar aqui muda o caminho de todas de uma vez.
        </span>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-900">
        <span className="text-[11px] text-zinc-500">reusar uma opção que já existe (a MESMA, não uma cópia)</span>
        <form action={adicionarExistente.bind(null, menu.id, reusarId)} className="flex items-center gap-1">
          <Select value={reusarId} onChange={(e) => setReusarId(e.target.value)} className="py-1 text-xs">
            <option value="">escolher opção…</option>
            {todasOpcoes
              .filter((o) => !menu.opcoes.some((m) => m.id === o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
          </Select>
          <button type="submit" disabled={!reusarId} className={mini}>
            reusar
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-900">
        {!menu.entrada && (
          <form action={definirEntradaMenu.bind(null, campaignId, menu.id)}>
            <button type="submit" className={mini} title="por onde a ligação começa">
              ▶ marcar como início
            </button>
          </form>
        )}
        <form action={duplicarMenuAction.bind(null, menu.id)}>
          <button
            type="submit"
            className={mini}
            title="cria um menu com as MESMAS opções e SEM destino — pra mandar esse mesmo conjunto de escolhas pra outro lugar"
          >
            ⧉ mesmas opções, outro destino
          </button>
        </form>
        <form action={apagarMenu.bind(null, menu.id)} onSubmit={onFechar} className="ml-auto">
          <ConfirmButton
            message={`Apagar o menu "${menu.nome}"? As opções dentro dele continuam existindo, mas ficam fora de menu até você reusá-las.`}
            className={`${mini} hover:text-red-500`}
          >
            apagar menu
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
