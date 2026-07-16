# HANDOFF — Deploy do CRM nesta VPS (para o Claude Code rodar aqui)

Você (Claude) está rodando **na VPS Linux de produção**. Sua tarefa: subir este CRM
com HTTPS e restaurar o banco de dados que o Iago vai trazer do PC dele.

O código já foi preparado pra produção no PC de origem. Os arquivos-chave já existem
no repositório: `compose.prod.yaml`, `Caddyfile`, `Dockerfile` (estágio `runner`),
e o guia `DEPLOY-VPS.md`. **Leia `DEPLOY-VPS.md` inteiro antes de agir** —
este handoff é o roteiro; aquele guia tem os detalhes e alternativas.

## Sobre este projeto (contexto que você não tem ainda)

- App **Next.js 16** (standalone) + **Postgres 17** + **Drizzle ORM**. App único:
  frontend e API (server actions) rodam no mesmo `server.js`. **Um subdomínio basta.**
- Em produção sobe com `compose.prod.yaml`: serviços `db`, `web` e `caddy` (proxy TLS).
- O `compose.prod.yaml` define `name: crm`, então os containers são nomeados
  deterministicamente: **`crm-db-1`**, **`crm-web-1`**, **`crm-caddy-1`**.
- Só o Caddy expõe portas (80/443). `web` e `db` ficam na rede interna do compose.
- ⚠️ **ANTES de escrever ou rodar qualquer código, leia `AGENTS.md` na raiz:** esta
  versão do Next tem breaking changes; consulte `node_modules/next/dist/docs/` se for
  mexer em código. (Pra este deploy você provavelmente não precisa mexer em código.)

## Pré-requisitos que você deve confirmar / pedir ao Iago

Pergunte ou verifique antes de começar:

1. **Domínio + DNS.** O subdomínio (ex.: `crm.libertysolutions.com.br`) precisa ter um
   registro **A** apontando pro IP desta VPS, já propagado. Confirme com:
   `dig +short crm.libertysolutions.com.br` → deve retornar o IP desta VPS.
   Se não retornar o IP certo, **pare** e peça pro Iago criar/ajustar o DNS — o Caddy
   não consegue emitir o certificado TLS sem isso.
2. **URL do repositório:** `https://github.com/iagomdb/crm-outbound-liberty.git`
   É privado. Quando o `git clone` pedir usuário/senha, peça a credencial ao Iago
   **na hora** (usuário GitHub + Personal Access Token como senha). **Não grave o token
   em arquivo nem no histórico.** Se ele preferir, pode fazer o clone ele mesmo.
3. **O arquivo `backup-crm.dump`** (o banco atual). O Iago vai trazer via `scp`. Ele pode
   já estar em `~/crm/` ou ele vai copiar. Confirme onde está antes da restauração.

## Passos

### 1. Instalar Docker (se ainda não houver)

```bash
docker --version || (curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER)
```
Se acabou de adicionar o usuário ao grupo docker, a sessão precisa relogar pra valer.

### 2. Firewall

```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

### 3. Obter o código

```bash
cd ~
git clone https://github.com/iagomdb/crm-outbound-liberty.git crm
cd crm
```
(Peça a credencial do GitHub ao Iago quando for solicitada. Não a persista.)

### 4. Criar o `.env` (NÃO está no repo — crie à mão)

Peça ao Iago uma **senha forte** pro Postgres e confirme o domínio. Depois:

```bash
cat > .env <<'EOF'
POSTGRES_USER=crm
POSTGRES_PASSWORD=<SENHA_FORTE_QUE_O_IAGO_DEFINIU>
POSTGRES_DB=crm
DOMAIN=crm.libertysolutions.com.br
ACME_EMAIL=iagobernardi@gmail.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EOF
```
Substitua o placeholder da senha e ajuste o `DOMAIN` se for outro subdomínio.
(SMTP pode ficar vazio agora; preencher depois só reinicia o `web`.)

### 5. Subir a stack

```bash
docker compose -f compose.prod.yaml up -d --build
```
Acompanhe o Caddy emitir o certificado:
```bash
docker compose -f compose.prod.yaml logs -f caddy
```
Espere `certificate obtained successfully`. Se falhar, quase sempre é DNS ainda não
apontando pra esta VPS, ou porta 80/443 bloqueada — verifique e tente de novo.

### 6. Restaurar o banco

Confirme onde está o `backup-crm.dump` (peça ao Iago se necessário). Assumindo `~/crm/`:

```bash
docker cp ~/crm/backup-crm.dump crm-db-1:/tmp/backup-crm.dump
docker exec crm-db-1 pg_restore -U crm -d crm --clean --if-exists /tmp/backup-crm.dump
```
Se em vez do `.dump` ele trouxe um `.sql`:
```bash
docker cp ~/crm/backup-crm.sql crm-db-1:/tmp/backup-crm.sql
docker exec crm-db-1 psql -U crm -d crm -f /tmp/backup-crm.sql
```

### 7. Reiniciar o web e validar

```bash
docker compose -f compose.prod.yaml restart web
docker compose -f compose.prod.yaml ps
```
Peça ao Iago pra abrir `https://<DOMAIN>` e fazer login. Se o login não persistir,
o cookie seguro depende do HTTPS estar funcionando — confirme que o site abre em
`https://` (cadeado), não `http://`.

## Verificação final (reporte ao Iago)

- [ ] `docker compose -f compose.prod.yaml ps` → `db`, `web`, `caddy` todos `Up`
- [ ] `https://<DOMAIN>` abre com cadeado (TLS válido)
- [ ] Login funciona e os dados do backup aparecem
- [ ] (Opcional) Backup diário via cron — ver seção no fim de `DEPLOY-VPS.md`

## Segurança — avise o Iago

O Personal Access Token do GitHub dele esteve exposto numa URL de remote no PC de
origem. Recomende que ele **revogue** esse token em
https://github.com/settings/tokens após o deploy e gere um novo, se ainda não fez.

## Se algo der errado

- Certificado TLS não emite → `dig +short <DOMAIN>` confere o IP? Portas 80/443 abertas?
- `web` reinicia em loop → `docker compose -f compose.prod.yaml logs web`. Cheque
  `DATABASE_URL`/senha do `.env` e se o `db` está `healthy`.
- Restauração falha → veja se o dump é formato custom (`-Fc`, use `pg_restore`) ou SQL
  texto (use `psql`). Detalhes e alternativas em `DEPLOY-VPS.md`.
