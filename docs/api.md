# API REST — HERMES IA

Base: `/api`. Autenticação: `Authorization: Bearer <accessToken>` (exceto `/auth/*`
e `/integrations/*`).

Respostas: `{ "data": ... }` ou `{ "data": [...], "meta": { page, pageSize, total, pages } }`.
Erros: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.

## Auth
| Método | Rota | Corpo |
|---|---|---|
| POST | `/auth/register` | `{ company: { name }, user: { name, email, password } }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/refresh` | `{ refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` |
| GET  | `/auth/me` | — |

## Clientes
`GET /customers?search=&page=&pageSize=` · `GET /customers/:id` (inclui `balance`)
`POST /customers` · `PUT /customers/:id` · `DELETE /customers/:id`

## Produtos / Estoque
`GET /products?search=&lowStock=` · `GET /products/low-stock` · `GET /products/:id`
`POST /products` · `PUT /products/:id` · `DELETE /products/:id`
`GET /inventory/movements?productId=` · `POST /inventory/movements` `{ productId, type: IN|OUT|ADJUST, quantity, reason? }`

## Vendas
`GET /sales?from=&to=&customerId=` · `GET /sales/summary/today` · `GET /sales/:id`
`POST /sales` `{ items: [{ productId?|description, quantity, unitPrice? }], customerId?, paymentMethod?, discount?, status?: PAID|PENDING|PARTIAL, paidAmount?, dueDate? }`

## Financeiro
`GET /finance/transactions?type=&from=&to=` · `POST /finance/transactions` `{ type: INCOME|EXPENSE, amount, description, categoryName?, paymentMethod?, occurredAt? }`
`GET /finance/cashflow?month=` · `GET /finance/categories`
`GET /finance/receivables?status=&customerId=` · `GET /finance/receivables/total` · `GET /finance/debtors`
`POST /finance/receivables` · `POST /finance/receivables/receive` `{ amount, receivableId?|customerId?, paymentMethod? }`
`GET /finance/payables?status=` · `GET /finance/payables/total`
`POST /finance/payables` · `POST /finance/payables/pay` `{ payableId, amount? }`
`GET /finance/due?until=` (aceita "hoje", "amanha", "10/12", ISO)

## Agenda
`GET /agenda?from=&to=&status=` · `GET /agenda/upcoming?days=` · `POST /agenda` · `PUT /agenda/:id` · `DELETE /agenda/:id`

## Relatórios
`GET /reports/overview` · `GET /reports/sales-by-day?days=` · `GET /reports/top-products?limit=`

## IA
`POST /ai/chat` `{ message }` → `{ reply, conversationId, toolCalls: [{name,status}], iterations }`
`GET /ai/conversations` · `GET /ai/conversations/:id/messages`
`GET /ai/tools` (catálogo de ferramentas) · `GET /ai/health`

## Canais
`GET /channels` · `POST /channels/pairing` `{ channel: TELEGRAM|WHATSAPP }` · `DELETE /channels/:id`

## Webhooks (públicos, sem JWT) — `/api/integrations`
`POST /integrations/telegram/webhook` (modo webhook)
`GET|POST /integrations/whatsapp/webhook` (verify + recebimento; ativa com `WHATSAPP_ENABLED=true`)
