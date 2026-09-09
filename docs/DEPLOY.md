# Deploy — HERMES IA (sem VPS)

O HERMES tem **3 peças**:

| Peça | O que é | Onde hospedar |
|------|---------|---------------|
| **Banco** | PostgreSQL | **Supabase** (já configurado) |
| **Frontend** | Vite → `dist/` estático | Seu hosting estático (zip), Cloudflare Pages, Netlify… |
| **Backend** | Node/Express (API + IA + bot + scheduler) | Hosting com **"Setup Node.js App"** *ou* PaaS (Render/Railway/Fly/Koyeb) |

> O frontend estático **não** contém regra de negócio — tudo passa pela API. Diferente
> do padrão "só Supabase": o HERMES precisa de um runtime Node rodando em algum lugar.

---

## 0. Banco (Supabase)

A cada nova migration:

```bash
export DATABASE_URL="postgresql://postgres:SENHA@db.SEU-REF.supabase.co:5432/postgres?sslmode=require"
npm run db:deploy       # aplica prisma/migrations no Supabase
npm run db:seed         # só na primeira vez (cria empresa/usuários demo)
```

Prefira a string do **Session pooler** se a direta não conectar (IPv6).

---

## 1. Frontend (estático)

```bash
cd frontend
# aponta o build para a URL pública da API:
#   Linux/Mac:  VITE_API_URL=https://api.seudominio.com npm run build
#   Windows:    set VITE_API_URL=https://api.seudominio.com&& npm run build
npm run build
```

- Sobe o conteúdo de **`frontend/dist/`** (zip → upload, ou git na Cloudflare Pages / Netlify).
- O `.htaccess` (Apache/LiteSpeed) e o `_redirects` (Netlify/CF) já vão no `dist/` para o
  **SPA fallback** (todas as rotas → `index.html`). Sem isso, dar F5 em `/vendas` dá 404.
- Domínio sugerido: `app.seudominio.com`.

---

## 2. Backend — Caminho A: hosting com "Setup Node.js App"

(Hostinger Business/Premium, cPanel + Passenger, Plesk…)

1. **Node 20+**, application root = a pasta do repo, **startup file** = `backend/dist/server.js`.
2. **Build** (no terminal SSH do hosting, ou no build hook):
   ```bash
   npm ci
   npm run db:generate
   npm run build --workspace backend
   npm run db:deploy
   ```
3. **Variáveis de ambiente** (painel do hosting) — ver [tabela abaixo](#variáveis-de-ambiente).
   O Passenger injeta `PORT` automaticamente; o servidor respeita.
4. Subdomínio sugerido: `api.seudominio.com` → apontando para o app Node.
5. **Reiniciar** o app pelo painel.
6. Teste: `curl https://api.seudominio.com/api/health` → `{"status":"ok","db":"up"}`.

> Se o painel não tiver "Node.js App", use o **Caminho B**.

---

## 2. Backend — Caminho B: PaaS (recomendado, grátis/barato)

**Render** (exemplo; Railway/Fly/Koyeb são análogos):

1. New → **Blueprint** → aponta para o repo. O [`render.yaml`](../render.yaml) cria
   `hermes-api` (Node) + `hermes-web` (estático).
   *Ou* manualmente: New → Web Service → repo → runtime Node
   - Build: `npm ci && npm run db:generate && npm run build --workspace backend`
   - Start: `npm run db:deploy && npm start`
   - Health check: `/api/health`
2. Preencha as variáveis (ver tabela).
3. O `Procfile` também funciona em Railway/Heroku (`release` roda migrations, `web` sobe).
4. **Free tier dorme** após ~15 min sem tráfego — para bot/scheduler confiáveis use
   uma instância paga (~US$7/mês) **ou** o Caminho A.

Frontend no mesmo Render como **Static Site** (`staticPublishPath: frontend/dist`,
build `npm ci && npm run build --workspace frontend`, env `VITE_API_URL`).

---

## 3. Telegram em produção (webhook)

Polling só serve para dev. Em produção:

```
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://api.seudominio.com
```

O servidor registra o webhook sozinho no boot. A rota é `POST /api/webhooks/telegram`.
Para conferir/forçar:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.seudominio.com/api/webhooks/telegram"
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Vincular a empresa: painel → **Integrações → Código Telegram** → enviar `/start CÓDIGO` ao bot.

---

## 4. Automações agendadas (cron externo)

O scheduler roda dentro do processo. Em hosting que hiberna o app, use um **cron externo**
batendo no endpoint protegido:

```
# diário 08:00
curl -fsS -X POST "https://api.seudominio.com/api/cron/tick?kind=daily&key=CRON_SECRET"
# semanal (segunda 08:00)
curl -fsS -X POST "https://api.seudominio.com/api/cron/tick?kind=weekly&key=CRON_SECRET"
```

Fontes de cron sem VPS: **hPanel → Cron Jobs**, cron-job.org, GitHub Actions
(`schedule:`), Render Cron Job. Defina `CRON_SECRET` no ambiente.

---

## Variáveis de ambiente

**Backend** (obrigatórias em **negrito**):

| Var | Exemplo / observação |
|-----|----------------------|
| **`DATABASE_URL`** | `postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres?sslmode=require` |
| **`JWT_SECRET`** | 48+ bytes aleatórios: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| **`WEB_ORIGIN`** | `https://app.seudominio.com` (CORS) |
| `APP_URL` / `API_URL` | URLs públicas do front e da API |
| `NODE_ENV` | `production` |
| `AI_PROVIDER` | `stub` (sem IA real) · `ollama` · `openrouter` · `openai`… |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | se `AI_PROVIDER` ≠ `stub` |
| `TELEGRAM_BOT_TOKEN` | do @BotFather |
| `TELEGRAM_MODE` | `webhook` em produção |
| `TELEGRAM_WEBHOOK_URL` | `https://api.seudominio.com` |
| `WHATSAPP_ENABLED` / `WHATSAPP_API_*` | opcional |
| `CRON_SECRET` | segredo do `/api/cron/tick` |
| `REDIS_URL` | opcional (reservado p/ filas) |

**Frontend** (no build):

| Var | Exemplo |
|-----|---------|
| `VITE_API_URL` | `https://api.seudominio.com` |

Nunca versione `.env`. Chaves reais só no painel do hosting / PaaS.

---

## Atualizações futuras

```bash
git pull
npm ci
# backend:
npm run build --workspace backend && npm run db:deploy   # (reiniciar o app)
# frontend:
VITE_API_URL=https://api.seudominio.com npm run build --workspace frontend   # (subir dist/)
```

Em PaaS ligado ao GitHub, `git push` já dispara o redeploy.

---

## Checklist

- [ ] `npm run db:deploy` rodado no Supabase
- [ ] Backend respondendo em `https://api.../api/health`
- [ ] `WEB_ORIGIN` = domínio do frontend (senão CORS bloqueia o login)
- [ ] Frontend buildado com `VITE_API_URL` e com `.htaccess`/`_redirects` no `dist/`
- [ ] `TELEGRAM_MODE=webhook` + `getWebhookInfo` OK
- [ ] Cron externo configurado (`/api/cron/tick`) se o host hiberna o processo
- [ ] `JWT_SECRET` forte e único (diferente do `.env.example`)
