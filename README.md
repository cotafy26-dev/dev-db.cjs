# HERMES IA

Assistente inteligente de **gestão empresarial por conversa**. O usuário administra
vendas, clientes, produtos, estoque, financeiro, agenda e cobranças **falando em
linguagem natural** com a IA — via Telegram, WhatsApp ou o painel web.

> Multi-tenant, preparado para operar como SaaS.

---

## Princípio central

A IA **nunca** toca no banco de dados. Ela interpreta a intenção, extrai os dados e
chama **ferramentas (functions)** controladas pelo backend. Só o backend escreve no
banco, e a IA só confirma uma operação **depois** que a ferramenta retorna sucesso.

```
Usuário → WhatsApp/Telegram/Web → Webhook/API → HERMES Orchestrator
        → Modelo (function calling) → Validação → Tool → Service → PostgreSQL
        → Resultado → Modelo → Resposta ao usuário
```

---

## Stack

| Camada        | Tecnologia                                                       |
|---------------|-----------------------------------------------------------------|
| Frontend      | React 18, Vite, TypeScript, Tailwind, TanStack Query, Zustand   |
| Backend       | Node 20+, TypeScript, Express, arquitetura modular              |
| Banco         | PostgreSQL + Prisma ORM                                          |
| Autenticação  | JWT (access + refresh com rotação), RBAC (OWNER/ADMIN/STAFF)    |
| IA            | Endpoint compatível com OpenAI (padrão: **Ollama + Hermes**) + `StubProvider` para testes |
| Mensageria    | Telegram Bot API (polling/webhook); WhatsApp Cloud API (estrutura pronta) |

---

## Requisitos

- Node.js 20+
- Um PostgreSQL acessível (recomendado: **Neon** ou **Supabase**, plano free)
- (Opcional, para a IA local) **Ollama** com um modelo que suporte tools

---

## Quickstart

```bash
# 1. Dependências (workspaces)
npm install

# 2. Configuração
cp .env.example .env
#   edite .env: cole a DATABASE_URL do Neon/Supabase e gere os JWT secrets:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Banco
npm run db:migrate          # cria as tabelas
npm run db:seed             # empresa demo:  demo@hermes.ia / hermes123

# 4. Subir (dois terminais)
npm run dev:backend         # API em http://localhost:3333
npm run dev:frontend        # painel em http://localhost:5173
```

### IA local com Ollama (opcional)

```bash
# instale o Ollama (https://ollama.com), depois:
ollama pull hermes3:8b
# .env já aponta AI_BASE_URL para http://localhost:11434/v1
```

Sem GPU dedicada as respostas levam ~10–40 s. Para validar rápido sem modelo:
`AI_PROVIDER=stub` (regras determinísticas em PT-BR). Para produção, aponte
`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` para um endpoint hospedado (OpenRouter,
Together, vLLM ou OpenAI).

### Telegram (opcional)

1. Crie um bot com o @BotFather e cole o token em `TELEGRAM_BOT_TOKEN`.
2. Reinicie o backend (modo `polling` por padrão).
3. No painel: **Configurações → Canais → Gerar código** e envie `/start CODIGO` ao bot.

---

## Scripts

| Comando                     | Ação                                            |
|-----------------------------|-------------------------------------------------|
| `npm run dev:backend`       | API com reload (`tsx watch`)                    |
| `npm run dev:frontend`      | Painel Vite                                     |
| `npm run build`             | Build de backend + frontend                     |
| `npm run db:migrate`        | Prisma migrate dev                              |
| `npm run db:seed`           | Popula dados de demonstração                    |
| `npm run db:studio`         | Prisma Studio                                   |
| `npm test`                  | Testes do backend (Vitest)                      |

---

## Estrutura

```
hermes-ia/
├── backend/
│   ├── prisma/schema.prisma      # 20 modelos, multi-tenant
│   └── src/
│       ├── core/                 # env, prisma (+ tenant guard), contexto, erros, datas, dinheiro
│       ├── http/                 # app express, rotas, middlewares (auth, erro)
│       ├── modules/              # auth, customers, products, inventory, sales, finance, agenda, reports
│       ├── ai/
│       │   ├── provider/         # adapter OpenAI-compatible + stub
│       │   ├── tools/            # 22 ferramentas (registrar_venda, registrar_despesa, ...)
│       │   ├── orchestrator.ts   # loop de function calling + auditoria
│       │   └── conversations.service.ts
│       └── integrations/         # telegram, whatsapp, pareamento de canais
└── frontend/
    └── src/
        ├── api/                  # axios + refresh automático
        ├── pages/                # Login, Dashboard, Assistente, Vendas, Clientes, Produtos, Financeiro, Agenda, Configurações
        └── components/           # UI primitives
```

Mais detalhes em [docs/architecture.md](docs/architecture.md) e a lista de
endpoints em [docs/api.md](docs/api.md).

---

## Multi-tenant (isolamento de dados)

Defesa em profundidade:

1. **Contexto de requisição** (`AsyncLocalStorage`) carrega o `companyId` — nunca vem do cliente.
2. **Services** filtram com `scope()` / `tenantWhere()`.
3. **Guarda no Prisma Client** (`$extends`): injeta `companyId` em `where`/`data` quando
   há contexto e **recusa** leituras de modelos de negócio sem contexto de tenant.
4. Toda entidade de negócio tem `companyId` + índices por tenant.

---

## Roadmap (próximas fases)

- WhatsApp Cloud API em produção (envio ativo + templates)
- Postgres Row-Level Security como 4ª camada
- Billing/planos (Stripe) — modelo `Subscription` já existe como stub
- Relatórios avançados e exportação
- Convite de usuários por e-mail, permissões granulares
- Testes de integração com banco efêmero
```
