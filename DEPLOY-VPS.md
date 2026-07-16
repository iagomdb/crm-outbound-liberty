# Deploy na VPS + migração do banco

Guia pra subir o CRM numa VPS Linux com HTTPS automático e levar o banco atual
(o Postgres do Docker deste PC, porta 5433) junto.

Arquitetura em produção:

```
Internet ──HTTPS──> Caddy (443) ──> web (Next standalone, :3000) ──> db (Postgres 17)
                      │
              cert Let's Encrypt automático
```

Um app Next.js único cobre frontend e API (server actions). **Um subdomínio basta**
— ex.: `crm.libertysolutions.com.br`. Não há serviço de API separado; `crmapi.*`
não é necessário.

---

## Parte 1 — Gerar o backup do banco atual (neste PC)

O Docker Desktop precisa estar rodando. O container do banco chama-se `crm-db-1`
(o `compose.yaml` define `name: crm`).

No PowerShell, na pasta do projeto:

```powershell
# Dump lógico completo (schema + dados), comprimido
docker exec crm-db-1 pg_dump -U crm -d crm -Fc | Set-Content -Encoding Byte backup-crm.dump
```

> `-Fc` = formato custom do pg (comprimido, restaurável com `pg_restore`).
> `Set-Content -Encoding Byte` evita o PowerShell corromper o binário (não use `>`).

Confira que gerou um arquivo com tamanho > 0:

```powershell
Get-Item backup-crm.dump | Select-Object Name, Length
```

Guarde esse `backup-crm.dump` — você vai copiá-lo pra VPS na Parte 4.

**Alternativa** (SQL texto puro, mais fácil de inspecionar, restaura com `psql`):

```powershell
docker exec crm-db-1 pg_dump -U crm -d crm | Set-Content -Encoding utf8 backup-crm.sql
```

---

## Parte 2 — Preparar a VPS (uma vez só)

SSH na VPS. Instale Docker + Compose plugin (Ubuntu/Debian):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # relogar a sessão SSH depois disso
```

Abra as portas 80 e 443 no firewall (e mantenha 22 pra SSH):

```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

**DNS:** no painel do seu domínio, crie um registro **A**:

| Tipo | Nome  | Valor            |
|------|-------|------------------|
| A    | `crm` | `IP.DA.SUA.VPS`  |

Isso cria `crm.libertysolutions.com.br`. Espere propagar (checar com
`ping crm.libertysolutions.com.br` ou `dig +short crm.libertysolutions.com.br`).
O Caddy só consegue emitir o certificado depois que o DNS aponta certo.

---

## Parte 3 — Subir o código na VPS

Clone o repositório (ou copie a pasta). Assumindo git:

```bash
git clone <URL-DO-SEU-REPO> crm && cd crm
```

Crie o arquivo `.env` **na VPS** (não vai versionado — precisa criar à mão):

```bash
cat > .env <<'EOF'
# Banco (troque a senha por uma forte!)
POSTGRES_USER=crm
POSTGRES_PASSWORD=TROQUE_POR_UMA_SENHA_FORTE
POSTGRES_DB=crm

# HTTPS
DOMAIN=crm.libertysolutions.com.br
ACME_EMAIL=iagobernardi@gmail.com

# SMTP (envio de e-mail) — preencha se for usar
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EOF
```

> A senha do Postgres que você definir aqui é a senha do banco **novo** na VPS.
> O `DATABASE_URL` do app é montado a partir dela automaticamente no compose.

Suba tudo (build da imagem de produção + Postgres + Caddy):

```bash
docker compose -f compose.prod.yaml up -d --build
```

Acompanhe o Caddy emitir o certificado:

```bash
docker compose -f compose.prod.yaml logs -f caddy
```

Quando aparecer `certificate obtained successfully`, abra
`https://crm.libertysolutions.com.br` — deve carregar (banco ainda vazio; a Parte 4 resolve).

---

## Parte 4 — Restaurar o banco na VPS

Copie o backup do seu PC pra VPS (rode no PowerShell do PC):

```powershell
scp backup-crm.dump usuario@IP.DA.SUA.VPS:/home/usuario/crm/
```

Na VPS, com a stack já rodando, restaure pro container do banco:

```bash
# Copia o dump pra dentro do container
docker cp backup-crm.dump crm-db-1:/tmp/backup-crm.dump

# Restaura (--clean recria objetos; --if-exists evita erro se não existirem ainda)
docker exec crm-db-1 pg_restore -U crm -d crm --clean --if-exists /tmp/backup-crm.dump
```

Se você gerou o `.sql` (alternativa da Parte 1):

```bash
docker cp backup-crm.sql crm-db-1:/tmp/backup-crm.sql
docker exec crm-db-1 psql -U crm -d crm -f /tmp/backup-crm.sql
```

Reinicie o web pra garantir conexão limpa e teste o login:

```bash
docker compose -f compose.prod.yaml restart web
```

Pronto — `https://crm.libertysolutions.com.br` agora com seus dados.

---

## Atualizações futuras (deploy de nova versão)

```bash
cd crm
git pull
docker compose -f compose.prod.yaml up -d --build
```

O Postgres tem `restart: unless-stopped` e volume persistente (`pgdata`) — os dados
não somem entre deploys. Só `web` e `caddy` são recriados.

## Migrações de schema (Drizzle)

Se o schema mudou (novas migrations em `src/db/migrations`), aplique dentro do container:

```bash
docker exec -w /app crm-web-1 npx drizzle-kit migrate
```

> Alternativamente, rode `db:migrate` do host apontando `DATABASE_URL` pro banco da VPS.

## Backup periódico na VPS (recomendado)

Um cron diário guardando os últimos 7 dias:

```bash
mkdir -p ~/backups
(crontab -l 2>/dev/null; echo '0 3 * * * docker exec crm-db-1 pg_dump -U crm -d crm -Fc > ~/backups/crm-$(date +\%F).dump; find ~/backups -name "crm-*.dump" -mtime +7 -delete') | crontab -
```
