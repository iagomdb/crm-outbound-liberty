# Roadmap — O Ciclo da Task (v1)

> O objetivo: nenhum lead sai do ciclo sem uma decisão explícita.
>
> ```
> importa xlsx → estado zero → gera task → entra na task (contexto pronto)
>      → liga → registra → nova task ou fim de ciclo
> ```
>
> A **task é a unidade de trabalho**. O Kanban vira visão de gestão; o dia a dia
> acontece numa fila de tasks que você desce de cima pra baixo.

## O que já existe (não reconstruir)

| Peça | Onde |
|---|---|
| Import xlsx consultas.plus (dedup CNPJ) | `scripts/import/` |
| Registro de ligação com playbook completo | `src/core/log-call.ts` + `CallLogForm` |
| Task embrionária (`nextActionAt` + `nextActionPretext` no target) | `src/db/schema.ts` |
| Agenda com buckets (atrasada/hoje/amanhã…) + snooze | `/agenda` |
| Estimativa de morte (8 tentativas ou 21 dias parado) | `src/core/death.ts` |
| Funil com razões (discadas→conversas→qualificado→reunião) | `src/core/funnel.ts` |

**Decisão de modelo:** NÃO criar tabela `tasks`. A task é o par
`nextActionAt` + `nextActionPretext` que já vive no target — um lead tem no
máximo UMA task aberta, o que espelha a cadência do playbook (um pretexto novo
por contato) e evita sincronizar duas fontes de verdade. "Não tem task" =
saiu do ciclo (e isso só pode acontecer em estágio terminal — ver Fase 2).

---

## Fase 1 — Estado zero (import → triagem)

*O import já funciona; o que falta é o estado zero ser explícito e triado.*

**Definição:** estado zero = target com `stage: novo`, `attempts: 0`, sem
`nextActionAt`. É o pool de leads que ainda não entrou no ciclo.

1. **Tela de triagem de ICP** (`/campaigns/[slug]/triagem`)
   - Lista as empresas com `icpFit: null` (o campo existe no schema, não tem UI).
   - Mostra o que decide o fit: CNAE principal, porte, capital social, UF.
   - Dois botões por linha: **fit** (`icpFit: true`, entra no pool) e
     **fora do ICP** (`icpFit: false` + arquiva o target com
     `archiveReason: "fora do ICP"`).
   - Por quê: o ICP é "médio indústria/distribuidora B2B" — discar fora disso é
     tempo perdido, e a decisão fica gravada (não retriar a mesma empresa).

2. **Pós-import aponta pra triagem**: o resumo do import ("N importadas, M
   duplicadas") ganha um link "triar agora".

*Sem migração de banco. Esforço: pequeno.*

---

## Fase 2 — A regra de ouro (fechar o vazamento)

*A regra que garante o "gera task" do diagrama. É a fase mais importante e a menor.*

1. **Registro de ligação em estágio não-terminal ⇒ task obrigatória.**
   Em `recordCall` / no server action: se o estágio resultante não é terminal
   (`ganho`, `perdido`, `nao_agora`, `handoff`) e `nextActionAt` veio vazio,
   **defaultar para +2 dias úteis** (cadência do playbook) em vez de deixar null.
   No form, deixar isso visível: o campo já vem preenchido com a sugestão.

2. **Estágio terminal ⇒ fim de ciclo explícito.** Limpa a task
   (`nextActionAt: null`) e, no caso de `perdido`, pede `lostReason`.
   `nao_agora` é o único terminal que REENTRA: agenda task longa
   (ex.: +90 dias, pretexto "retomar — disse só ano que vem").

3. **Matar o alçapão da agenda.** O botão "concluir" hoje limpa a task sem
   registrar ligação — o lead evapora sem contar tentativa. Trocar o CTA
   principal de cada item da agenda por **"abrir task"** (Fase 3); "concluir"
   vira escape secundário com confirmação.

*Sem migração de banco. Esforço: ~1h. Fazer PRIMEIRO.*

---

## Fase 3 — Fila do Dia + Tela da Task (o coração)

*"Entrar na task e já puxar o que eu anotei e preciso fazer."*

1. **Fila do Dia** (`/fila` — vira a home do dia a dia)
   Uma lista única, na ordem em que você deve ligar:
   - 🔴 **Atrasadas** (nextActionAt < hoje)
   - 🟢 **Hoje**
   - ⚪ **Estado zero** (novos com `icpFit: true`, por `priority`) — a task
     implícita "primeira ligação"
   Cada linha: empresa, telefone, pretexto da task, tentativa nº X, medidor de
   morte. Clicou → tela da task.

2. **Tela da Task** (`/fila/[targetId]` ou o próprio `/targets/[id]` em "modo
   execução") — tudo que você precisa pra ligar SEM caçar informação:
   - **Cabeçalho de discagem:** telefone(s) com link `tel:`, nome do
     decisor/contato, melhor horário, golden hour agora? (`golden-hours.ts`)
   - **O pretexto DESTA ligação** em destaque (a task).
   - **Memória da última ligação:** resultado, onde travou (a frase exata),
     objeção, estado mental — pra retomar de onde parou, não recomeçar.
   - **Histórico compacto** das ligações anteriores + pretextos já usados
     (cadência teimosa = nunca repetir pretexto).
   - **Formulário de registro logo abaixo** (o CallLogForm já existe).
   - Registrar ⇒ regra de ouro da Fase 2 gera a próxima task ⇒ botão
     **"próxima da fila"** (modo discagem: gastar zero cliques entre ligações).

*Sem migração de banco (é UI + queries). Esforço: a maior fase, ~1 dia.*

---

## Fase 4 — Fim de ciclo (nada evapora)

*Todo lead termina em exatamente um destes estados — e dá pra auditar.*

| Fim | Gatilho | O que acontece |
|---|---|---|
| **Ganho** | reunião realizada → handoff | `meetings` já registra; task limpa |
| **Perdido** | decisor recusou de verdade | `lostReason` obrigatório |
| **Não agora** | "só ano que vem" real | task longa de reentrada (+90d) |
| **Morto por cadência** | 8 tentativas OU 21 dias parado | `death.ts` já detecta; arquivar com motivo |

1. **Aba "fora do ciclo"** na campanha: arquivados/perdidos/não-agora com
   motivo e data — pra revisar se o funil está vazando por razão errada.
2. **Varredura de órfãos** (guarda-corpo): query que acha targets ativos SEM
   task e SEM estágio terminal (não deveria existir após a Fase 2); mostrar
   alerta na Fila do Dia se achar algum.

*Esforço: pequeno.*

---

## Fase 5 — Medição do dia (depois que o ciclo roda)

- **Contador no topo da Fila:** discadas / conversas / reuniões **hoje**
  (meta do playbook do lado: ex. 30 discadas/dia).
- Razões do funil por campanha já existem — só ganhar destaque na home.
- Nada disso bloqueia o ciclo; só medir depois que houver o que medir.

---

## Ordem de implementação sugerida

1. **Fase 2** (regra de ouro) — 10 linhas que fecham o vazamento. Sem ela, as
   outras fases constroem em cima de um balde furado.
2. **Fase 3** (fila + tela da task) — transforma o CRM em ferramenta de operação.
3. **Fase 1** (triagem) — necessária antes de importar a lista real dos ~129.
4. **Fase 4** (fins de ciclo + órfãos) — guarda-corpos.
5. **Fase 5** (medição) — quando houver volume.

**Pré-requisito operacional:** rodar `npm run db:reset` (limpa fixture, mantém
campanhas) antes de importar a lista real, que está no outro PC.
