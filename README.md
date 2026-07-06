# CRM Outbound — Liberty

CRM próprio para prospecção outbound. Primeira campanha: **recuperação de crédito**
(SDR agendando reuniões para o escritório). O modelo de dados encoda o playbook em
[`docs/cold-call-recuperacao-credito-v2.md`](docs/cold-call-recuperacao-credito-v2.md) —
conta conversa-com-humano (não discada), rastreia onde a ligação travou, cadência com
pretexto novo, e o funil por razões.

## Stack

Next.js 16 · React 19 · TypeScript · PostgreSQL 17 · Drizzle ORM · Tailwind v4 ·
Zod. Tudo em Docker.

## Rodar (do zero)

Pré-requisito: Docker. Se ainda não tem (Linux Mint/Ubuntu):

```bash
sudo bash scripts/setup-docker.sh
newgrp docker            # ou logout/login
```

Subir a stack:

```bash
cp .env.example .env     # já vem preenchido para dev local
docker compose up --build
```

- App: <http://localhost:3000>
- Adminer (banco): <http://localhost:8080> — server `db`, user/senha/base `crm`

A página inicial mostra o status da conexão com o Postgres — é o teste de fumaça da Fase 1.

## Comandos úteis

```bash
docker compose up --build     # sobe db + web + adminer
docker compose down           # para tudo (mantém os dados no volume pgdata)
docker compose exec web sh    # shell no container do app

npm run db:generate           # gera migração SQL a partir do schema
npm run db:migrate            # aplica migrações
npm run db:seed               # cria a campanha #1 (idempotente)
npm run db:studio             # Drizzle Studio (inspeciona o banco)
npm run db:reset              # limpa empresas/ligações (mantém campanhas)
npm run import -- <arquivo>   # importa lista de empresas (consultas.plus .xlsx)
```

> `db:*` e `import` conectam via `localhost:5433` (porta publicada pelo container —
> a 5432 fica pro Postgres local), lendo `DATABASE_URL` do `.env`. Precisam do
> `docker compose up` rodando.

## Estrutura

```
src/
  app/      telas (Next App Router)
  db/       schema + cliente Drizzle + migrations
  core/     regras puras (cadência, funil, ICP, golden-hours)  [Fase 2+]
  components/
scripts/
  import/   importador xlsx → banco   [Fase 3]
docs/       o playbook
data/        listas .xlsx (não versionado — PII)
```

## Status

- [x] Fase 1 — fundação (Next + Docker + Postgres + Drizzle)
- [x] Fase 2 — modelo de dados (campanha, empresa, contato, alvo, ligação, reunião)
- [x] Fase 3 — importador xlsx (consultas.plus) com merge por CNPJ
- [x] Fase 4 — cockpit de ligação (fila + detalhe + log com ritual pós-ligação)
- [x] Fase 5 — dashboard de razões (funil discadas→conversas→qualificados→reuniões)

### Importar a lista real

```bash
npm run db:reset                       # limpa os dados de demo (mantém a campanha)
npm run import -- data/lista.xlsx      # importa a lista real (consultas.plus)
```
