# Deploy na VPS (pm2 + nginx + Postgres do host) + migração do banco

Este CRM vai rodar **seguindo o padrão da VPS**, não em Docker:

- **App** (Next.js standalone) rodando via **pm2** direto no host, em `127.0.0.1:3100`.
- **Banco** no **Postgres 18 do host** (`127.0.0.1:5432`) — um role `crm` + database `crm`,
  igual ao padrão `dev`/`homolog`/`libertysolutions` (um role superuser + um banco por ambiente).
- **TLS/proxy** pelo **nginx** já instalado, com **certbot**, via um novo par
  `sites-available`/`sites-enabled`.

> **NÃO use Docker nem Caddy aqui.** O nginx já ocupa 80/443 com TLS; subir Caddy
> quebraria. Portas já tomadas na VPS: 80, 443, 3000, 4000, 5000, 5002, 5005, 5432.
> O CRM usa **3100** (loopback), que o nginx faz proxy pro subdomínio.

Arquitetura:

```
Internet ──HTTPS(443)──> nginx (host, certbot TLS) ──proxy──> 127.0.0.1:3100 (pm2: crm)
                                                                     │
                                                          Postgres 18 host 127.0.0.1:5432 (db "crm")
```

App único: frontend e API (server actions) no mesmo `server.js`. **Um subdomínio basta**
— `crm.libertysolutions.com.br`. Não há backend separado (as outras apps têm par
backend+frontend; o CRM é um server block só).

---

## Parte 1 — Gerar o backup do banco atual (no PC do Iago)

O banco de origem é o Postgres do Docker do PC (container `crm-db-1`, Postgres 17).
Docker Desktop precisa estar rodando. No PowerShell, na pasta do projeto:

```powershell
docker exec crm-db-1 pg_dump -U crm -d crm -Fc | Set-Content -Encoding Byte backup-crm.dump
```

> `-Fc` = formato custom comprimido (restaura com `pg_restore`).
> `Set-Content -Encoding Byte` evita o PowerShell corromper o binário — **não** use `>`.
> Restaurar de PG17 (origem) pro PG18 (VPS) funciona sem problema.

Confira o tamanho e leve o `backup-crm.dump` pra VPS (Parte 4).

---

## Parte 2 — Pré-requisitos na VPS (uma vez)

**Node 24.** O CRM é Next 16 e precisa de Node 24 pra buildar. Confirme:

```bash
node -v   # precisa ser >= 24
```

Se for mais antigo, instale o 24 sem afetar as outras apps pm2 (via nvm ou nodesource).
Prefira nvm pro usuário de deploy se as apps existentes já usam nvm.

**DNS.** Registro **A** `crm` → IP público da VPS (cria `crm.libertysolutions.com.br`).
Confirme antes de emitir o certificado:

```bash
dig +short crm.libertysolutions.com.br   # deve retornar o IP desta VPS
```

---

## Parte 3 — Banco: role + database no Postgres do host

Como superusuário do Postgres (ex.: `sudo -u postgres psql`), crie o role e o db no
mesmo padrão dos outros ambientes:

```sql
CREATE ROLE crm WITH LOGIN PASSWORD 'SENHA_FORTE_DO_CRM';
CREATE DATABASE crm OWNER crm;
```

> Use uma senha forte e guarde-a; ela vai no `DATABASE_URL` do `.env` (Parte 5).
> O Postgres do host só escuta em 127.0.0.1, então a conexão é por loopback.

---

## Parte 4 — Restaurar o dump no banco do host

Copie o backup pra VPS (no PowerShell do PC):

```powershell
scp backup-crm.dump deploy@IP.DA.VPS:/home/deploy/
```

Na VPS, restaure pro database `crm`. O dump não contém os roles, então mapeamos o dono
pro role `crm` com `--no-owner`:

```bash
sudo -u postgres pg_restore -d crm --no-owner --clean --if-exists /home/deploy/backup-crm.dump
```

> `--no-owner` faz os objetos pertencerem a quem restaura/ao db (role `crm`), ignorando
> o dono original do dump. `--clean --if-exists` recria objetos sem erro se não existirem.
>
> Se você gerou `.sql` texto em vez de `.dump`:
> `sudo -u postgres psql -d crm -f /home/deploy/backup-crm.sql`

---

## Parte 5 — Código do app + build + pm2

Coloque o código no padrão da VPS (`/home/deploy/<nome>`):

```bash
cd /home/deploy
git clone https://github.com/iagomdb/crm-outbound-liberty.git crm
cd crm
```

Crie o `.env` (não versionado):

```bash
cat > .env <<'EOF'
DATABASE_URL=postgres://crm:SENHA_FORTE_DO_CRM@127.0.0.1:5432/crm
NODE_ENV=production
PORT=3100
HOSTNAME=127.0.0.1
TZ=America/Sao_Paulo
# SMTP (envio de e-mail) — preencha se for usar
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EOF
```

> O cookie de sessão usa `Secure` em produção; como o nginx serve HTTPS, funciona sem
> `AUTH_COOKIE_SECURE`. Não defina essa variável.

Instale, buildue rode o standalone. O build gera `.next/standalone/server.js`:

```bash
npm ci
npm run build

# O standalone precisa dos estáticos ao lado do server.js:
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
```

Suba com pm2 apontando pro server.js standalone. Como o standalone **não** lê `.env`
sozinho, carregue as variáveis via um ecosystem file (padrão pm2):

```bash
cat > /home/deploy/crm/ecosystem.config.js <<'EOF'
const fs = require("fs");
const path = require("path");
// Lê o .env da pasta e injeta no processo pm2.
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
module.exports = {
  apps: [{
    name: "crm",
    script: ".next/standalone/server.js",
    cwd: __dirname,
    env,
  }],
};
EOF

pm2 start ecosystem.config.js
pm2 save
```

> Confirme: `pm2 logs crm` sem erros e `curl -s 127.0.0.1:3100 | head` respondendo.
> Se as apps existentes já usam outro padrão de env no pm2, siga o padrão delas.

---

## Parte 6 — nginx: server block + TLS (certbot)

Crie `/etc/nginx/sites-available/crm.libertysolutions.com.br` seguindo o padrão dos
outros sites da VPS. Base (o certbot completa a parte TLS ao rodar):

```nginx
server {
    server_name crm.libertysolutions.com.br;
    client_max_body_size 25m;   # importação de planilhas Excel

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 80;
}
```

> Copie o estilo exato de um site liberty-* existente se divergir nos headers.

Ative e teste:

```bash
sudo ln -s /etc/nginx/sites-available/crm.libertysolutions.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Emita o certificado (certbot ajusta o server block pra 443 automaticamente):

```bash
sudo certbot --nginx -d crm.libertysolutions.com.br
```

---

## Parte 7 — Validar

- `pm2 status` → `crm` `online`
- `https://crm.libertysolutions.com.br` abre com cadeado
- Login funciona e os dados do backup aparecem

---

## Atualizações futuras

```bash
cd /home/deploy/crm
git pull
npm ci
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
pm2 restart crm --update-env
```

## Migrações de schema (Drizzle)

Se houver novas migrations em `src/db/migrations`, aplique apontando pro banco do host:

```bash
cd /home/deploy/crm
DATABASE_URL=postgres://crm:SENHA_FORTE_DO_CRM@127.0.0.1:5432/crm npx drizzle-kit migrate
```

## Backup periódico (cron)

```bash
mkdir -p ~/backups
(crontab -l 2>/dev/null; echo '0 3 * * * sudo -u postgres pg_dump -Fc crm > ~/backups/crm-$(date +\%F).dump; find ~/backups -name "crm-*.dump" -mtime +7 -delete') | crontab -
```
