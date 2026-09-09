# API REST — HERMES IA

Base: `/api`. Auth: `Authorization: Bearer <accessToken>` (exceto `/auth/*` e `/webhooks/*`).
Respostas: `{ "data": ... }` ou `{ "data": [...], "meta": { page, pageSize, total, pages } }`.
Erros: `{ "error": { "code", "message", "details?" } }`. Toda rota valida **permissão** por perfil.

## Auth
`POST /auth/register` `{ company:{name,segment?,document?,timezone?,currency?}, user:{name,email,password} }`
`POST /auth/login` · `POST /auth/refresh` `{refreshToken}` · `POST /auth/logout` · `GET /auth/me`

## Empresa / Assinatura / LGPD
`GET|PUT /company` · `POST /company/onboarding/complete`
`GET /company/plans` · `GET /company/permissions`
`GET /company/lgpd/export` · `POST /company/lgpd/erase-customer/:id`

## Usuários (RBAC)
`GET /users` · `POST /users` `{name,email,password,role}` · `PUT /users/:id` · `DELETE /users/:id`

## Clientes / Fornecedores
`GET /customers?search=` · `GET /customers/:id` · `GET /customers/:id/history`
`POST /customers` · `PUT /customers/:id` · `DELETE /customers/:id` (soft)
`GET /suppliers` · `GET /suppliers/:id` · `POST /suppliers` · `PUT /suppliers/:id` · `DELETE /suppliers/:id`

## Produtos / Categorias / Estoque
`GET /products?search=&categoryId=&lowStock=` · `GET /products/low-stock` · `GET /products/:id`
`POST /products` · `PUT /products/:id` · `DELETE /products/:id`
`GET|POST /products/categories` · `PUT|DELETE /products/categories/:id`
`GET /inventory/:productId` · `GET /inventory/movements?productId=`
`POST /inventory/movement` `{ productId, type: IN|OUT|ADJUST|RETURN, quantity, reason? }`

## Vendas
`GET /sales?from=&to=&customerId=&status=` · `GET /sales/summary/today` · `GET /sales/:id`
`POST /sales` `{ items:[{productId?|description, quantity, unitPrice?, discount?}], customerId?, sellerId?, paymentMethod?, discount?, paidAmount?, dueDate? }`
`POST /sales/:id/cancel` `{ reason? }` (estorna estoque + financeiro)

## Financeiro
`GET|POST /finance/incomes` · `GET|POST /finance/expenses`
`GET /finance/cashflow?month=` · `GET /finance/balance` · `GET /finance/categories?direction=IN|OUT`
`GET /finance/receivables?status=&customerId=` · `GET /finance/receivables/total` · `GET /finance/debtors` · `POST /finance/receivables`
`GET /finance/payables?status=` · `GET /finance/payables/total` · `POST /finance/payables`
`POST /finance/payments` `{ amount, direction?: IN|OUT, accountReceivableId?|customerId?, accountPayableId?, method? }`
`GET /finance/overdue` · `GET /finance/due?until=`

## Cobranças (§14)
`GET /charges/overdue-customers` · `GET /charges?status=`
`POST /charges` `{ accountReceivableId, channel?, autoReminder?, message? }`
`POST /charges/:id/send` · `POST /charges/:id/cancel`

## Agenda
`GET /appointments?from=&to=&status=` · `GET /appointments/today` · `GET /appointments/upcoming?days=`
`POST /appointments` · `PUT /appointments/:id` · `POST /appointments/:id/cancel`

## Relatórios (§15)
`GET /reports/overview`
`GET /reports/sales?period=today|yesterday|week|month`
`GET /reports/financial?period=` · `GET /reports/profit?period=`
`GET /reports/inventory` · `GET /reports/customers` · `GET /reports/sellers?period=`

## Notificações
`GET /notifications?unreadOnly=` (`meta.unread`) · `POST /notifications/:id/read` · `POST /notifications/read-all`

## Automações (§25)
`GET /automations` · `GET /automations/options` · `POST /automations` · `PUT /automations/:id` · `DELETE /automations/:id`

## Auditoria / IA
`GET /audit?action=&entityType=`
`POST /ai/chat` `{ message }` → `{ reply, conversationId, toolCalls:[{name,status}], iterations }`
`GET /ai/conversations` · `GET /ai/conversations/:id/messages` · `GET /ai/executions` · `GET /ai/tools` · `GET /ai/health`

## Canais / Integrações
`GET /channels` · `POST /channels/pairing` `{ channel: TELEGRAM|WHATSAPP }` · `DELETE /channels/:id`
`GET /settings/integrations` · `PUT /settings/integrations/:provider`

## Webhooks (públicos, sem JWT)
`POST /webhooks/telegram` · `GET|POST /webhooks/whatsapp`
(também acessíveis sob `/integrations/*`)
