# Tato

Assistente inteligente de **gestão empresarial por conversa**. O usuário administra
vendas, clientes, produtos, estoque, financeiro, agenda, cobranças, relatórios e
automações **falando em linguagem natural** com a IA — via **Telegram**, **WhatsApp**
ou o **painel web**.

SaaS multi-tenant, com RBAC, auditoria, automações e planos (BASIC / PRO / BUSINESS).

---

## Sumário

- [Princípio central](#princípio-central)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Instalação e execução local](#instalação-e-execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco e migrations](#banco-e-migrations)
- [Docker](#docker)
- [IA (Hermes)](#ia-hermes)
- [Telegram](#telegram)
- [WhatsApp](#whatsapp)
- [Perfis e permissões](#perfis-e-permissões)
- [Scripts](#scripts)
- [Estrutura](#estrutura)
- [Produção](#produção)
- [Troubleshooting](#troubleshooting)

---

## Princípio central

A IA **nunca** toca no banco de dados. Ela interpreta a intenção, extrai os dados e
chama **ferramentas (functions)** controladas pelo backend, com **validação, autorização
por perfil e retorno estruturado**. Só o backend escreve no banco, e a IA só confirma
uma operação **depois** que a ferramenta retorna sucesso. Operações destrutivas exigem
confirmação explícita do usuário.

```
Usuário → WhatsApp/Telegram/Web → Webhook/API → Tato Orchestrator
  → Modelo (function calling) → validação + autorização → Tool → Service → PostgreSQL
  → resultado → Modelo → resposta ao usuário   (+ AIExecution + AuditLog)
```

---

## Stack

| Camada     | Tecnologia                                                            |
|------------|---------------------------------------------------------------------|
| Frontend   | React 18, Vite, TypeScript, Tailwind (claro/escuro), TanStack Query, Zustand |
| Backend    | Node 20+, TypeScript, Express, arquitetura modular                  |
| Banco      | PostgreSQL + Prisma ORM (32+ modelos, timestamps, soft delete)      |
| Auth       | JWT (access + refresh com rotação) + RBAC (ADMIN/MANAGER/SELLER/FINANCE) |
| IA         | Endpoint compatível com OpenAI (padrão **Ollama + Hermes**) + `StubProvider` |
| Mensageria | `MessagingProvider` desacoplado → `TelegramProvider` / `WhatsAppProvider` |
| Filas      | Scheduler in-process; `REDIS_URL` reservado para BullMQ (§35)        |

---

## Requisitos

- **Node.js 20+**
- Um **PostgreSQL** acessível — recomendado [Neon](https://neon.tech) ou
  [Supabase](https://supabase.com) (plano free), ou Docker (ver abaixo)
- (Opcional, IA local) **Ollama** com um modelo que suporte *tools*

---

## Instalação e execução local

```bash
# 1. Dependências (workspaces: backend + frontend)
npm install
npm run db:generate          # gera o Prisma Client (o ambiente pode bloquear o postinstall)

# 2. Configuração
cp .env.example .env         # edite: DATABASE_URL + JWT_SECRET
#   JWT_SECRET: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Banco
npm run db:migrate           # cria as tabelas
npm run db:seed              # empresa demo + 3 usuários

# 4. Subir (um terminal só)
npm run dev                  # API :3333  +  painel :5173
#   ou separados:  npm run dev:backend   /   npm run dev:frontend
```

### Sem PostgreSQL instalado? Postgres embarcado (dev)

Não precisa de Docker nem instalação. Um Postgres real é baixado e roda em
`localhost:5433`, com dados em `backend/.dev-postgres/`:

```bash
npm run dev:db     # terminal 1 — deixa rodando
# backend/.env já pode apontar para:
#   DATABASE_URL=postgresql://hermes:hermes@localhost:5433/hermes?schema=public
npm run db:migrate && npm run db:seed   # terminal 2 (uma vez)
npm run dev                              # terminal 2 — API + painel
```

**Login demo** (após `db:seed`):

| Perfil  | E-mail                 | Senha       |
|---------|------------------------|-------------|
| ADMIN   | `demo@hermes.ia`       | `hermes123` |
| SELLER  | `vendedor@hermes.ia`   | `hermes123` |
| FINANCE | `financeiro@hermes.ia` | `hermes123` |

Primeiro acesso de uma conta nova passa por um **onboarding** (segmento, moeda,
fuso horário, conectar Telegram).

---

## Variáveis de ambiente

Ver [`.env.example`](.env.example). Principais:

| Var | Descrição |
|-----|-----------|
| `DATABASE_URL` | string de conexão PostgreSQL |
| `JWT_SECRET` | segredo único (deriva access/refresh); ou defina os dois separados |
| `AI_PROVIDER` | `ollama` \| `openai` \| `openrouter` \| `together` \| `vllm` \| `stub` |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | endpoint compatível com OpenAI |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_MODE` | `polling` (dev) \| `webhook` \| `off` |
| `WHATSAPP_*` | Cloud API oficial ou provedor compatível |
| `REDIS_URL` | opcional (filas) |
| `APP_URL` / `API_URL` / `WEB_ORIGIN` | URLs públicas / CORS |

Nunca versione `.env`. Nunca coloque chaves reais no código.

---

## Banco e migrations

- Schema em [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).
- `npm run db:migrate` — cria/aplica migrations em dev.
- `npm run db:deploy` — aplica migrations em produção (usado pelo container).
- `npm run db:seed` — dados de demonstração (idempotente para planos/permissões).
- `npm run db:studio` — Prisma Studio.
- `npm run db:reset` — recria o banco (dev).

Multi-tenant: toda entidade de negócio tem `companyId` + índices por tenant; a leitura
sem contexto de tenant é bloqueada no Prisma Client (`$extends`).

---

## Docker

```bash
docker compose up --build
#   frontend  → http://localhost:8080
#   API       → http://localhost:3333
#   Postgres  → localhost:5432 (hermes/hermes)
```

O container do backend roda `prisma migrate deploy` antes de subir. Para filas:
`docker compose --profile queues up` (sobe o Redis).

Também há [`docker/docker-compose.yml`](docker/docker-compose.yml) só com Postgres,
para quem quer rodar backend/frontend fora de container.

---

## IA (Hermes)

Padrão: **Ollama local**.

```bash
# instale o Ollama (https://ollama.com), depois:
ollama pull hermes3:8b
```

Sem GPU dedicada roda em CPU (lento, ~10–40 s/resposta). Para desenvolver rápido sem
modelo: `AI_PROVIDER=stub` (regras determinísticas PT-BR → chama as mesmas tools).
Para produção, aponte para um endpoint hospedado (OpenRouter, Together, vLLM, OpenAI).

- 49 ferramentas (`create_customer`, `create_sale`, `cancel_sale`, `create_expense`,
  `register_payment`, `create_appointment`, `get_sales_report`, `send_message`, …).
- Memória de conversa (últimas N mensagens + resumo + memória operacional).
- `AIExecution` registra cada execução (input, output, tools, tokens, duração) para
  diagnóstico. `GET /api/ai/executions`.
- Segurança: anti prompt-injection, rate limit por usuário, tools filtradas por perfil.

---

## Telegram

1. Crie um bot com o [@BotFather](https://t.me/BotFather) e cole o token em
   `TELEGRAM_BOT_TOKEN`.
2. Reinicie o backend (modo `polling` por padrão; `webhook` em produção com
   `TELEGRAM_WEBHOOK_URL`).
3. No painel: **Integrações → Código Telegram** e envie `/start CÓDIGO` ao bot.

Comandos: `/start` `/help` `/status` `/resumo` `/vendas` `/financeiro` — ou linguagem
natural. Webhook: `POST /api/webhooks/telegram`.

---

## WhatsApp

Camada desacoplada (`MessagingProvider`). Ative com `WHATSAPP_ENABLED=true` +
`WHATSAPP_API_URL` + `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` +
`WHATSAPP_VERIFY_TOKEN`.

- Verificação: `GET /api/webhooks/whatsapp` (hub.challenge).
- Recebimento: `POST /api/webhooks/whatsapp`.
- Envio: texto, mídia, documentos e templates via `WhatsAppProvider`.

> O sistema **não** emite NF-e/NFC-e/NFS-e. Gera apenas documentos internos, recibos
> e comprovantes; a arquitetura está preparada para integração fiscal futura.

---

## Perfis e permissões

| Perfil   | Acesso |
|----------|--------|
| ADMIN    | total |
| MANAGER  | vendas, estoque, clientes, fornecedores, financeiro, cobranças, relatórios |
| SELLER   | clientes, vendas (apenas as próprias), agenda |
| FINANCE  | financeiro, contas, pagamentos, cobranças, relatórios financeiros, auditoria |

Toda permissão é validada **no backend** (`requirePermission`). O frontend apenas
esconde itens de menu.

---

## Scripts

| Comando | Ação |
|---------|------|
| `npm run dev` | API + painel juntos |
| `npm run build` | build de backend + frontend |
| `npm start` | inicia a API compilada |
| `npm test` | testes do backend (Vitest) |
| `npm run db:migrate` / `db:seed` / `db:studio` / `db:reset` | banco |
| `npm run docker:up` / `docker:down` | stack Docker |

---

## Estrutura

```
hermes-ia/
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── core/         env, prisma(+tenant guard), contexto, permissoes, audit, scheduler, datas, dinheiro
│       ├── http/         app express, rotas, middlewares (auth, requirePermission, erro)
│       ├── modules/      auth, rbac, plans, companies(+LGPD), users, customers, suppliers,
│       │                 products(+categories), inventory, sales, finance, charges,
│       │                 appointments, reports, notifications, automation, audit, integrations
│       ├── ai/           provider (OpenAI-compat + stub), tools (49), orchestrator, security, conversations
│       └── integrations/ messaging (MessagingProvider), telegram, webhooks, inbound/outbound, channels
├── frontend/
│   └── src/  api · stores(auth,theme) · layouts · pages (Dashboard, Assistente, Vendas, ...) · components
├── docker-compose.yml · backend/Dockerfile · frontend/Dockerfile
└── docs/  architecture.md · api.md
```

Mais detalhes: [`docs/architecture.md`](docs/architecture.md) e [`docs/api.md`](docs/api.md).

---

## Produção

Passo a passo completo (hosting sem VPS, PaaS, Telegram webhook, cron externo):
**[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

Resumo:
- **Banco:** Supabase — `npm run db:deploy` a cada migration.
- **Frontend:** `VITE_API_URL=https://api... npm run build --workspace frontend` → sobe
  `frontend/dist/` (o `.htaccess`/`_redirects` de SPA já vão junto).
- **Backend:** hosting com "Setup Node.js App" **ou** PaaS (Render/Railway/Fly). Há
  [`render.yaml`](render.yaml) e `Procfile` prontos.
- `NODE_ENV=production`, `JWT_SECRET` forte, `WEB_ORIGIN` = domínio do front,
  `TELEGRAM_MODE=webhook` + `TELEGRAM_WEBHOOK_URL`, `CRON_SECRET` para `/api/cron/tick`.
- Logs estruturados (pino) sem senhas/tokens; erros padronizados; nunca stack trace ao cliente.

---

## Troubleshooting

| Sintoma | Causa provável / solução |
|---|---|
| `Environment variable not found: DATABASE_URL` | `.env` ausente ou `DATABASE_URL` não definida |
| `Prisma Client` não encontrado | rode `npm run db:generate` (postinstall pode estar bloqueado) |
| `TENANT_CONTEXT_MISSING` | consulta a modelo de negócio fora de uma request autenticada |
| IA responde `AI health` offline | Ollama não está rodando ou `AI_BASE_URL`/`AI_MODEL` errados; use `AI_PROVIDER=stub` para testar |
| Telegram não responde | `TELEGRAM_BOT_TOKEN` ausente, `TELEGRAM_MODE=off`, ou canal não vinculado (`/start CÓDIGO`) |
| `429 AI_RATE_LIMITED` | muitas mensagens seguidas; ajuste `AI_RATE_PER_MIN` |
| Respostas da IA lentas | modelo em CPU; use modelo menor ou endpoint hospedado |
