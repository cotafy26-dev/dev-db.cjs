# Arquitetura — HERMES IA

## Visão geral

Monorepo com dois pacotes (`backend`, `frontend`) via npm workspaces.

O backend é dividido em camadas:

- **core/** — infra transversal: carga/validação de env (Zod), logger (pino),
  Prisma Client com *tenant guard*, contexto de requisição (`AsyncLocalStorage`),
  utilitários de dinheiro (`Prisma.Decimal`) e datas (dayjs + parser PT-BR).
- **http/** — aplicação Express, registro de rotas, middlewares (request-id,
  autenticação/contexto, tratamento de erro central).
- **modules/** — domínios de negócio. Cada módulo tem `*.service.ts` (regra de
  negócio, única camada que fala com o Prisma) e `*.controller.ts` (rotas REST +
  validação Zod).
- **ai/** — orquestração da IA: provider, ferramentas, orchestrator, persistência
  de conversa.
- **integrations/** — canais externos (Telegram, WhatsApp) e o ponto de entrada
  único `handleInboundMessage`.

## Fluxo de uma mensagem da IA

1. Entrada: `POST /api/ai/chat` (web, autenticado) **ou** webhook/polling de
   Telegram/WhatsApp.
2. Para canais externos, `handleInboundMessage` resolve o **tenant** pelo
   `ChannelLink (channel, externalId)`. Sem vínculo, tenta consumir um
   `PairingCode` (`/start CODIGO`).
3. Estabelece o `RequestContext` (`companyId`, `userId`, `source`) via
   `runWithContext`.
4. `runOrchestrator`:
   - carrega histórico da `Conversation` (últimas 16 mensagens),
   - monta `system prompt` (regras + data/hora + empresa),
   - chama o modelo com o catálogo de **tool schemas** (JSON Schema gerado a
     partir de Zod),
   - **loop** (máx. `AI_MAX_TOOL_ITERATIONS`): se o modelo pediu tools, cada
     chamada é validada (Zod), executada via `executeTool` → `service`, o
     resultado volta como mensagem `role: "tool"`, e auditada em `AiToolCall`.
   - quando o modelo responde sem tools, o texto final é persistido e devolvido.
5. A resposta é enviada de volta pelo canal de origem.

### Garantia "não confirmar antes da hora"

O `system prompt` proíbe afirmar sucesso sem retorno de ferramenta, e o
orchestrator só devolve ao usuário o texto que o modelo gera **após** ver os
resultados das tools. Erros de tool voltam como `{ "error": "..." }` e o modelo é
instruído a reportá-los.

### Desambiguação

Tools que resolvem entidades por nome (cliente/produto/conta) lançam
`NeedsClarification` quando há mais de um candidato. Isso vira
`{ needsClarification: true, question, candidates }` no resultado da tool, e o
modelo pergunta ao usuário em vez de escolher sozinho.

## Multi-tenancy

| Camada | Mecanismo |
|--------|-----------|
| 1 | `RequestContext` via `AsyncLocalStorage` — `companyId` nunca vem do payload do cliente |
| 2 | Services usam `scope()` / `tenantWhere()` / `tenantData()` |
| 3 | `prisma.$extends` (`core/prisma.ts`): injeta `companyId` em operações com `where`/`data` quando há contexto; **lança** se um modelo de negócio (`HARD_TENANT_MODELS`) for lido sem contexto |
| 4 | Schema: `companyId` + `@@index([companyId, ...])` em todas as entidades de negócio; `@@unique` compostos por tenant (ex.: `Sale.number`) |
| — | Futuro: Postgres Row-Level Security |

`findUnique`/`update`/`delete` por id **não** são filtrados pelo guard (o `where`
por unique não aceita `companyId`); por isso os services usam finders
`findFirst({ where: tenantWhere({ id }) })` ou `ensureSameTenant(row)` após
carregar.

## Modelo de dados (resumo)

- **Tenancy/Auth:** `Company`, `User`, `RefreshToken`, `Subscription` (stub billing)
- **CRM:** `Customer`
- **Catálogo/Estoque:** `Product`, `StockMovement` (IN/OUT/ADJUST, com `balanceAfter`)
- **Vendas:** `Sale`, `SaleItem` (venda gera baixa de estoque + lançamento
  financeiro + `Receivable` se fiado)
- **Financeiro:** `FinanceCategory`, `FinanceTransaction`, `Receivable`, `Payable`
  (status `OPEN/PARTIAL/PAID/CANCELED`)
- **Agenda:** `AgendaEvent`
- **IA:** `Conversation`, `Message`, `ChannelLink`, `PairingCode`, `AiToolCall`

## Dinheiro

Valores monetários usam `Prisma.Decimal` (`@db.Decimal(12,2)`); quantidades de
estoque `@db.Decimal(14,3)`. Helpers `money()` / `qty()` em `core/money.ts`
arredondam com `ROUND_HALF_UP`. Nunca usar `number` para acumular dinheiro no
domínio.

## Autenticação

- `POST /auth/register` cria `Company` + `User(OWNER)` + `Subscription(TRIALING)` +
  categorias financeiras padrão.
- Access token JWT (15 min) + refresh token (30 d) **persistido com hash** em
  `RefreshToken`; `POST /auth/refresh` **rotaciona** (revoga o antigo).
- Middleware `authenticate` valida o access token e abre o `RequestContext` para
  toda a cadeia; `authorize(...roles)` para RBAC.

## Provider de IA

`AIProvider` (`chat`, `health`). Implementações:

- `OpenAICompatibleProvider` — usa o SDK `openai` com `baseURL` custom; funciona
  com Ollama (`/v1`), OpenRouter, Together, vLLM, OpenAI.
- `StubProvider` — regex determinístico PT-BR; usado em testes
  (`AI_PROVIDER=stub`) e para desenvolvimento offline.

Trocar de provider é só mudar `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`,
`AI_MODEL` no `.env`.
