# Arquitetura — Tato

Monorepo npm workspaces: `backend` + `frontend`.

## Camadas (backend)

- **core/** — infra transversal: `env` (Zod), `logger` (pino), `prisma` (com *tenant
  guard* via `$extends`), `context` (`AsyncLocalStorage`), `permissions` (matriz RBAC),
  `audit`, `scheduler`, `money` (`Prisma.Decimal`), `dates` (parser PT-BR de datas
  naturais no fuso da empresa), `bootstrap` (planos + catálogo de permissões).
- **http/** — app Express, registro de rotas, middlewares: `request-id`,
  `authenticate` (JWT → abre `RequestContext`), `requirePermission(...)`, tratamento
  central de erro (padroniza; nunca stack trace ao cliente).
- **modules/** — domínios. Cada um: `*.service.ts` (regra de negócio, única camada
  que fala com Prisma; grava `AuditLog`) e `*.controller.ts` (rotas REST + Zod +
  `requirePermission`).
- **ai/** — `provider` (cliente OpenAI-compatível + `StubProvider`), `tools`
  (registry + 49 definições com `permission` e `destructive`), `orchestrator`,
  `security`, `conversations` (memória), `system-prompt`.
- **integrations/** — `messaging` (`MessagingProvider` + Telegram/WhatsApp),
  `inbound` (comandos + roteamento p/ orchestrator), `outbound`, `webhooks`, `channels`.

## Multi-tenancy (§5)

| Camada | Mecanismo |
|--------|-----------|
| 1 | `RequestContext` via `AsyncLocalStorage` — `companyId` nunca vem do payload |
| 2 | Services usam `scope()` / `tenantWhere()` / `tenantData()` |
| 3 | `prisma.$extends`: injeta `companyId` quando há contexto; **lança** se um modelo de negócio (`HARD_TENANT_MODELS`) for lido sem contexto |
| 4 | Schema: `companyId` + `@@index([companyId, …])`; `@@unique` compostos por tenant |

`findUnique`/`update`/`delete` por id não são filtrados pelo guard — os services
carregam com `findFirst({ where: { ...scope(), id } })` ou usam `ensureSameTenant()`.

## RBAC (§6)

- `UserRole` enum: `ADMIN | MANAGER | SELLER | FINANCE` (fonte de verdade do
  enforcement, rápido, sem join).
- `core/permissions.ts`: `PERMISSIONS` + `ROLE_MATRIX` (código).
- Tabelas `Role` / `Permission` / `RolePermission`: espelham a matriz por empresa
  (seed no registro), expostas em `GET /company/permissions` para transparência.
- `requirePermission(...keys)` — passa se o perfil tem **alguma** das chaves.
- SELLER: `sales.service` injeta `sellerId = currentUserId` em list/get/summary
  (`sale.read.own`).

## Fluxo da IA (§16)

1. Entrada: `POST /api/ai/chat` (web) **ou** webhook/polling Telegram/WhatsApp.
2. Canais externos: `handleInboundMessage` resolve tenant pelo `ChannelLink`
   (`channel`, `externalId`); sem vínculo, consome `PairingCode` (`/start CÓDIGO`).
   Comandos (`/resumo`, `/vendas`, …) são atendidos direto.
3. `runWithContext({ companyId, userId, role, source })`.
4. `runOrchestrator`:
   - `security`: rate limit por usuário + flag de prompt-injection.
   - carrega histórico (últimas `AI_HISTORY_MESSAGES`) + `summary` + memória operacional.
   - `system prompt` (§29) fixo — a mensagem do usuário não o altera (§30).
   - chama o modelo com **tool schemas filtrados pelo perfil**.
   - loop (≤ `AI_MAX_TOOL_ITERATIONS`): valida args (Zod), checa permissão da tool,
     exige `confirm` em tools `destructive` (§18), executa via service, devolve
     resultado como mensagem `role:"tool"`, atualiza memória operacional.
   - `NeedsClarification` → `{ needsClarification, question, candidates }` (§19).
   - grava `AIExecution` (§28) e `AuditLog` (§27) quando houve tool.
   - `maybeSummarize` condensa mensagens antigas (§20), sem chamar o modelo.

## Automações & Scheduler (§25 / §35)

- `Automation { trigger, action, config }`. Triggers: `schedule.daily|weekly`,
  `stock.low`, `customer.overdue`, `account.due_soon`, `sale.created`.
- `core/scheduler.ts`: `setInterval` de 10 min, dispara diárias às 08:00 e semanais
  na segunda. `REDIS_URL` reservado para BullMQ (não implementado nesta versão).
- `fireTrigger(companyId, trigger)` roda dentro de um contexto de sistema.

## Notificações (§26)

`Notification { type, title, body }` no painel; `notify()` é o ponto de extensão
para Telegram/WhatsApp/e-mail. Contador de não lidas em `GET /notifications`.

## Modelo de dados (resumo)

Plan · Subscription · Company · User · Role · Permission · RolePermission ·
Customer · Supplier · ProductCategory · Product · Inventory · InventoryMovement ·
Sale · SaleItem · Payment · FinancialCategory · Income · Expense ·
AccountReceivable · AccountPayable · Charge · Appointment · Notification ·
ChannelLink · PairingCode · Conversation · Message · AIExecution ·
Automation · Document · AuditLog · Integration.

Dinheiro em `Decimal(12,2)`; quantidades em `Decimal(14,3)`. `createdAt`/`updatedAt`
em todos; `deletedAt` (soft delete) em Customer/Supplier/Product/ProductCategory/User.

## LGPD (§44)

- Controle de acesso (RBAC) + auditoria + logs sem credenciais.
- `GET /company/lgpd/export` — portabilidade (JSON completo do tenant).
- `POST /company/lgpd/erase-customer/:id` — anonimização + soft delete.
- `Company.retentionDays` — política de retenção configurável (base para expurgo).

## Segurança da IA (§30)

- System prompt imutável pelo usuário; instrução explícita para recusar
  "ignore as regras" / pedidos de dados de outra empresa.
- Tool schemas e execução **filtrados pelo perfil** (sem chamadas não autorizadas).
- Args validados por Zod (sem manipulação de parâmetros fora do schema).
- Rate limit por (empresa+usuário); truncagem de mensagens gigantes.
- Isolamento cross-tenant garantido pelas 4 camadas de multi-tenancy.
