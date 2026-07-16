# HANDOFF — Deploy do CRM nesta VPS (para o Claude Code rodar aqui)

Você (Claude) está rodando **na VPS Linux de produção**. Tarefa: subir este CRM
(Next.js) **seguindo o padrão existente desta máquina** e restaurar o banco que o Iago
traz do PC dele.

**Leia `DEPLOY-VPS.md` inteiro antes de agir** — este handoff é o roteiro resumido;
aquele guia tem os comandos completos e as alternativas.

## ⚠️ Como esta VPS realmente funciona (não invente outro padrão)

- Apps Node rodam via **pm2 direto no host** (dev-*, libertysolutions-*). **NÃO em Docker.**
- **nginx** no host termina TLS (via **certbot**) e faz proxy reverso; padrão
  `sites-available`/`sites-enabled`, um server block por app. nginx já ocupa **80/443**.
- **Postgres 18 no host**, escutando só em `127.0.0.1:5432`. Um role superusuário + um
  database por ambiente (`dev`, `homolog`, `libertysolutions`). Docker aqui só roda Redis.
- Código dos apps mora em `/home/deploy/<nome>`.
- **Portas já ocupadas: 80, 443, 3000, 4000, 5000, 5002, 5005, 5432.** O CRM usa **3100**.

> **NÃO use Docker nem Caddy pra este deploy.** Subir Caddy conflita com o nginx (80/443).
> Rodar em Docker foge do padrão pm2 da máquina. Se algum passo te empurrar pra Docker/Caddy,
> pare — está errado. O repo pode ter tido `compose.prod.yaml`/`Caddyfile` no histórico;
> ignore-os, o modelo é pm2+nginx+Postgres-host.

## O que é este app

- **Next.js 16** standalone (`output: "standalone"` → gera `.next/standalone/server.js`).
  Precisa de **Node 24** pra buildar. App único: frontend + API (server actions) no mesmo
  processo. **Um subdomínio basta** (`crm.libertysolutions.com.br`), sem backend separado.
- ⚠️ **Antes de escrever/rodar qualquer código, leia `AGENTS.md` na raiz:** esta versão do
  Next tem breaking changes; consulte `node_modules/next/dist/docs/`. (Pra este deploy você
  não deve precisar mexer em código.)

## Confirme com o Iago antes de começar

1. **DNS:** `dig +short crm.libertysolutions.com.br` deve retornar o IP desta VPS. Se não,
   **pare** e peça pro Iago criar o registro A. certbot não emite certificado sem isso.
2. **Repo:** `https://github.com/iagomdb/crm-outbound-liberty.git` (privado). Quando o
   `git clone` pedir credencial, peça ao Iago na hora (usuário + Personal Access Token).
   **Não grave o token em arquivo nem no histórico de shell.**
3. **Senha do banco `crm`** (você vai criar o role) e **senha do superusuário Postgres**
   pra criar role+db.
4. **`backup-crm.dump`** — o Iago traz via `scp` (provavelmente pra `/home/deploy/`).
5. **Node 24** disponível? `node -v`. Se não, instale pelo mesmo mecanismo das outras
   apps (provável nvm) sem quebrá-las.

## Passos

### 1. Banco (Postgres host)
```bash
sudo -u postgres psql -c "CREATE ROLE crm WITH LOGIN PASSWORD 'SENHA_DO_IAGO';"
sudo -u postgres psql -c "CREATE DATABASE crm OWNER crm;"
```

### 2. Restaurar o dump
```bash
sudo -u postgres pg_restore -d crm --no-owner --clean --if-exists /home/deploy/backup-crm.dump
```
(`--no-owner` porque o dump vem com dono `crm` do PC, mas os roles não vêm no dump.)
Se for `.sql`: `sudo -u postgres psql -d crm -f /home/deploy/backup-crm.sql`

### 3. Código + build
```bash
cd /home/deploy
git clone https://github.com/iagomdb/crm-outbound-liberty.git crm && cd crm
```
Crie o `.env` (peça a senha do banco ao Iago):
```bash
cat > .env <<'EOF'
DATABASE_URL=postgres://crm:SENHA_DO_IAGO@127.0.0.1:5432/crm
NODE_ENV=production
PORT=3100
HOSTNAME=127.0.0.1
TZ=America/Sao_Paulo
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EOF
```
Não defina `AUTH_COOKIE_SECURE` — com HTTPS do nginx o cookie seguro funciona.
```bash
npm ci
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
```

### 4. pm2
O standalone não lê `.env` sozinho — carregue via ecosystem file (ver `DEPLOY-VPS.md`
Parte 5 pro conteúdo do `ecosystem.config.js`), então:
```bash
pm2 start ecosystem.config.js && pm2 save
pm2 logs crm --lines 30      # sem erros?
curl -s 127.0.0.1:3100 | head
```

### 5. nginx + certbot
Crie `/etc/nginx/sites-available/crm.libertysolutions.com.br` (server block com
`proxy_pass http://127.0.0.1:3100;`, `client_max_body_size 25m;` pra import de Excel,
e os headers `X-Forwarded-*` — modelo completo no `DEPLOY-VPS.md` Parte 6). **Copie o
estilo de um site liberty-* existente** pra manter o padrão. Depois:
```bash
sudo ln -s /etc/nginx/sites-available/crm.libertysolutions.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.libertysolutions.com.br
```

## Verificação final (reporte ao Iago)
- [ ] `pm2 status` → `crm` `online`
- [ ] `https://crm.libertysolutions.com.br` abre com cadeado (TLS válido)
- [ ] Login funciona e os dados do backup aparecem
- [ ] (Opcional) cron de backup diário — seção final do `DEPLOY-VPS.md`

## Segurança — avise o Iago
O Personal Access Token do GitHub dele apareceu numa URL de remote no PC de origem.
Recomende revogar em https://github.com/settings/tokens e gerar um novo.

## Se algo der errado
- certbot não emite → `dig +short <DOMAIN>` bate no IP da VPS? nginx `-t` ok?
- `crm` não sobe no pm2 → `pm2 logs crm`; cheque `DATABASE_URL`/senha e se o Postgres
  aceita a conexão (`psql "postgres://crm:...@127.0.0.1:5432/crm" -c '\dt'`).
- porta 3100 ocupada → escolha outra livre e ajuste `.env` (PORT) + `proxy_pass` do nginx.
- restore falha → dump custom (`-Fc`) usa `pg_restore`; `.sql` usa `psql`. Ver `DEPLOY-VPS.md`.
