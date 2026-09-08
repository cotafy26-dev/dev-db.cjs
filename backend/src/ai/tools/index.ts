import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isAppError } from '../../core/errors';
import { formatBRL } from '../../core/money';
import type { ToolSchema } from '../provider/types';
import { NeedsClarification, parseWhen, periodRange, resolveCustomerId, resolveProduct } from './helpers';

import * as customers from '../../modules/customers/customers.service';
import * as products from '../../modules/products/products.service';
import * as inventory from '../../modules/inventory/inventory.service';
import * as sales from '../../modules/sales/sales.service';
import * as finance from '../../modules/finance/finance.service';
import * as agenda from '../../modules/agenda/agenda.service';
import * as reports from '../../modules/reports/reports.service';
import { prisma } from '../../core/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface HermesTool<T extends z.ZodType = any> {
  name: string;
  description: string;
  schema: T;
  handler: (args: z.infer<T>) => Promise<unknown>;
}

const paymentEnum = z
  .enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'TRANSFER', 'BOLETO', 'OTHER'])
  .describe('Forma de pagamento');

function tool<T extends z.ZodType>(t: HermesTool<T>): HermesTool<T> {
  return t;
}

export const tools: HermesTool[] = [
  // ---------------------------------------------------------------- VENDAS
  tool({
    name: 'registrar_venda',
    description:
      'Registra uma venda com um ou mais itens. Use fiado=true quando o cliente for pagar depois. ' +
      'Se o produto existir no catalogo, informe product/description; o preco do catalogo e usado quando unitPrice for omitido.',
    schema: z.object({
      items: z
        .array(
          z.object({
            description: z.string().describe('Nome do produto/item'),
            quantity: z.number().positive(),
            unitPrice: z.number().nonnegative().optional().describe('Preco unitario; omita para usar o do catalogo'),
          }),
        )
        .min(1),
      customerName: z.string().optional().describe('Nome do cliente (sera criado se nao existir)'),
      paymentMethod: paymentEnum.nullish(),
      discount: z.number().nonnegative().optional(),
      fiado: z.boolean().optional().describe('true = cliente paga depois (gera conta a receber)'),
      paidAmount: z.number().nonnegative().optional().describe('Valor pago agora, se pagamento parcial'),
      dueDateText: z.string().optional().describe('Vencimento do fiado, ex.: "amanha", "10/12"'),
    }),
    async handler(a) {
      const customerId = await resolveCustomerId(a.customerName, { createIfMissing: true });
      const items = [];
      for (const it of a.items) {
        let productId: string | undefined;
        let unitPrice = it.unitPrice;
        try {
          const p = await resolveProduct(it.description);
          productId = p.id;
          unitPrice = unitPrice ?? p.price;
        } catch (err) {
          if (err instanceof NeedsClarification) throw err;
          // produto nao cadastrado: venda avulsa exige unitPrice
        }
        items.push({ productId, description: it.description, quantity: it.quantity, unitPrice });
      }
      const status = a.fiado ? (a.paidAmount && a.paidAmount > 0 ? 'PARTIAL' : 'PENDING') : 'PAID';
      const sale = await sales.createSale({
        items,
        customerId,
        paymentMethod: a.paymentMethod ?? null,
        discount: a.discount,
        status,
        paidAmount: a.paidAmount,
        dueDate: a.dueDateText ? parseWhen(a.dueDateText) : null,
      });
      return {
        number: sale.number,
        total: sale.total.toNumber(),
        status: sale.status,
        items: sale.items.map((i) => ({ description: i.description, quantity: i.quantity.toNumber(), total: i.total.toNumber() })),
        message: `Venda #${sale.number} registrada - ${formatBRL(sale.total)} (${sale.status}).`,
      };
    },
  }),

  tool({
    name: 'resumo_vendas',
    description: 'Retorna o total de vendas de um periodo (hoje, ontem ou mes).',
    schema: z.object({ period: z.enum(['hoje', 'ontem', 'mes']).default('hoje') }),
    async handler(a) {
      const r = periodRange(a.period);
      const s = await sales.salesSummary({ from: r.from, to: r.to });
      return { period: r.label, count: s.count, gross: s.gross, received: s.received, pending: s.pending };
    },
  }),

  // -------------------------------------------------------------- FINANCEIRO
  tool({
    name: 'registrar_despesa',
    description: 'Registra uma despesa (saida de dinheiro).',
    schema: z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      categoryName: z.string().optional().describe('Ex.: Combustivel, Aluguel, Fornecedores'),
      paymentMethod: paymentEnum.nullish(),
      dateText: z.string().optional().describe('Ex.: "hoje", "ontem", "05/12"'),
    }),
    async handler(a) {
      const t = await finance.createTransaction({
        type: 'EXPENSE',
        amount: a.amount,
        description: a.description,
        categoryName: a.categoryName,
        paymentMethod: a.paymentMethod ?? null,
        occurredAt: a.dateText ? parseWhen(a.dateText) : undefined,
      });
      return { id: t.id, amount: t.amount.toNumber(), description: t.description, message: `Despesa de ${formatBRL(t.amount)} registrada.` };
    },
  }),

  tool({
    name: 'registrar_receita',
    description: 'Registra uma receita avulsa (entrada de dinheiro que nao e venda).',
    schema: z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      categoryName: z.string().optional(),
      paymentMethod: paymentEnum.nullish(),
      dateText: z.string().optional(),
    }),
    async handler(a) {
      const t = await finance.createTransaction({
        type: 'INCOME',
        amount: a.amount,
        description: a.description,
        categoryName: a.categoryName,
        paymentMethod: a.paymentMethod ?? null,
        occurredAt: a.dateText ? parseWhen(a.dateText) : undefined,
      });
      return { id: t.id, amount: t.amount.toNumber(), message: `Receita de ${formatBRL(t.amount)} registrada.` };
    },
  }),

  tool({
    name: 'registrar_recebimento',
    description:
      'Registra um pagamento recebido de um cliente, abatendo das contas a receber em aberto (da mais antiga para a mais nova).',
    schema: z.object({
      amount: z.number().positive(),
      customerName: z.string().optional(),
      paymentMethod: paymentEnum.nullish(),
    }),
    async handler(a) {
      const customerId = (await resolveCustomerId(a.customerName)) ?? undefined;
      const res = await finance.receivePayment({ amount: a.amount, customerId, paymentMethod: a.paymentMethod ?? null });
      return {
        applied: res.applied,
        leftover: res.unappliedChange,
        message:
          `Recebimento de ${formatBRL(a.amount)} registrado.` +
          (res.unappliedChange > 0 ? ` Sobrou ${formatBRL(res.unappliedChange)} sem conta correspondente.` : ''),
      };
    },
  }),

  tool({
    name: 'total_a_receber',
    description: 'Soma de tudo que a empresa tem para receber (contas a receber em aberto).',
    schema: z.object({}),
    async handler() {
      const total = await finance.totalReceivable();
      return { total, message: `Total a receber: ${formatBRL(total)}.` };
    },
  }),

  tool({
    name: 'total_a_pagar',
    description: 'Soma de tudo que a empresa tem para pagar (contas a pagar em aberto).',
    schema: z.object({}),
    async handler() {
      const total = await finance.totalPayable();
      return { total, message: `Total a pagar: ${formatBRL(total)}.` };
    },
  }),

  tool({
    name: 'lista_devedores',
    description: 'Lista os clientes que estao devendo e quanto cada um deve.',
    schema: z.object({}),
    async handler() {
      const rows = await finance.debtorsSummary();
      return {
        devedores: rows.map((d) => ({ cliente: d.name, valor: d.total, contas: d.count })),
        message: rows.length
          ? rows.map((d) => `${d.name}: ${formatBRL(d.total)}`).join('; ')
          : 'Ninguem esta devendo no momento.',
      };
    },
  }),

  tool({
    name: 'contas_a_vencer',
    description: 'Lista contas a pagar e a receber que vencem ate a data informada.',
    schema: z.object({ until: z.string().default('hoje').describe('Ex.: "hoje", "amanha", "sexta", "10/12"') }),
    async handler(a) {
      const date = parseWhen(a.until);
      const res = await finance.dueUntil(date);
      return res;
    },
  }),

  tool({
    name: 'faturamento_mes',
    description: 'Fluxo de caixa do mes: entradas, saidas e saldo.',
    schema: z.object({ monthText: z.string().optional().describe('Ex.: "este mes", "novembro", "11/2025"') }),
    async handler(a) {
      const ref = a.monthText ? parseWhen(a.monthText) : new Date();
      const cf = await finance.monthRevenue(ref);
      return { ...cf, message: `Entradas ${formatBRL(cf.income)} | Saidas ${formatBRL(cf.expense)} | Saldo ${formatBRL(cf.net)}.` };
    },
  }),

  tool({
    name: 'criar_conta_a_pagar',
    description: 'Cria uma conta a pagar (compromisso futuro).',
    schema: z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      supplierName: z.string().optional(),
      dueDateText: z.string().optional(),
    }),
    async handler(a) {
      const p = await finance.createPayable({
        description: a.description,
        amount: a.amount,
        supplierName: a.supplierName ?? null,
        dueDate: a.dueDateText ? parseWhen(a.dueDateText) : null,
      });
      return { id: p.id, message: `Conta a pagar criada: ${a.description} - ${formatBRL(a.amount)}.` };
    },
  }),

  tool({
    name: 'pagar_conta',
    description: 'Marca uma conta a pagar como paga (parcial ou total). Identifique a conta pelo texto da descricao/fornecedor.',
    schema: z.object({
      search: z.string().min(1).describe('Trecho da descricao ou nome do fornecedor'),
      amount: z.number().positive().optional().describe('Valor pago; omita para quitar o total em aberto'),
      paymentMethod: paymentEnum.nullish(),
    }),
    async handler(a) {
      const matches = await finance.findPayableForPayment(a.search);
      if (matches.length === 0) throw new NeedsClarification(`Nao achei conta a pagar em aberto com "${a.search}".`, []);
      if (matches.length > 1) {
        throw new NeedsClarification(
          'Ha mais de uma conta a pagar correspondente. Qual delas?',
          matches.map((m) => ({ id: m.id, description: m.description, valor: m.amount.toNumber(), venc: m.dueDate })),
        );
      }
      const updated = await finance.payBill({
        payableId: matches[0]!.id,
        amount: a.amount,
        paymentMethod: a.paymentMethod ?? null,
      });
      return { id: updated.id, status: updated.status, message: `Conta "${matches[0]!.description}" atualizada (${updated.status}).` };
    },
  }),

  // ---------------------------------------------------------------- CLIENTES
  tool({
    name: 'cadastrar_cliente',
    description: 'Cadastra um novo cliente.',
    schema: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
    }),
    async handler(a) {
      const c = await customers.createCustomer(a);
      return { id: c.id, name: c.name, message: `Cliente "${c.name}" cadastrado.` };
    },
  }),

  tool({
    name: 'buscar_cliente',
    description: 'Busca um cliente por nome e retorna seus dados e saldo devedor.',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const res = await customers.findCustomerByName(a.name);
      if (!res.match) return { found: false, candidates: res.candidates };
      const balance = await customers.customerBalance(res.match.id);
      return {
        found: true,
        id: res.match.id,
        name: res.match.name,
        phone: res.match.phone,
        balance,
        message: balance > 0 ? `${res.match.name} deve ${formatBRL(balance)}.` : `${res.match.name} nao tem pendencias.`,
      };
    },
  }),

  tool({
    name: 'saldo_cliente',
    description: 'Quanto um cliente especifico esta devendo.',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const id = await resolveCustomerId(a.name);
      if (!id) return { found: false, message: `Cliente "${a.name}" nao encontrado.` };
      const balance = await customers.customerBalance(id);
      return { found: true, balance, message: `${a.name} deve ${formatBRL(balance)}.` };
    },
  }),

  // ------------------------------------------------------- PRODUTOS / ESTOQUE
  tool({
    name: 'cadastrar_produto',
    description: 'Cadastra um novo produto no catalogo.',
    schema: z.object({
      name: z.string().min(1),
      price: z.number().nonnegative(),
      stock: z.number().nonnegative().optional(),
      minStock: z.number().nonnegative().optional(),
      unit: z.string().optional(),
      cost: z.number().nonnegative().optional(),
      sku: z.string().optional(),
    }),
    async handler(a) {
      const p = await products.createProduct(a);
      return { id: p.id, name: p.name, message: `Produto "${p.name}" cadastrado a ${formatBRL(p.price)}.` };
    },
  }),

  tool({
    name: 'ajustar_estoque',
    description:
      'Ajusta o estoque de um produto. mode="set" define o saldo, "add" soma (entrada), "remove" subtrai (saida).',
    schema: z.object({
      productName: z.string().min(1),
      quantity: z.number().positive(),
      mode: z.enum(['set', 'add', 'remove']).default('set'),
      reason: z.string().optional(),
    }),
    async handler(a) {
      const p = await resolveProduct(a.productName);
      const type = a.mode === 'add' ? 'IN' : a.mode === 'remove' ? 'OUT' : 'ADJUST';
      const res = await prisma.$transaction((tx) =>
        inventory.applyStockMovement({ productId: p.id, type, quantity: a.quantity, reason: a.reason }, tx),
      );
      return { product: p.name, balance: res.balanceAfter, message: `Estoque de "${p.name}" agora: ${res.balanceAfter}.` };
    },
  }),

  tool({
    name: 'buscar_produto',
    description: 'Busca um produto por nome e retorna preco e estoque.',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const res = await products.findProductByName(a.name);
      if (!res.match) return { found: false, candidates: res.candidates };
      return {
        found: true,
        id: res.match.id,
        name: res.match.name,
        price: res.match.price.toNumber(),
        stock: res.match.stock.toNumber(),
        unit: res.match.unit,
      };
    },
  }),

  tool({
    name: 'produtos_estoque_baixo',
    description: 'Lista produtos cujo estoque esta no minimo ou abaixo.',
    schema: z.object({}),
    async handler() {
      const rows = await products.lowStockProducts();
      return {
        produtos: rows,
        message: rows.length
          ? rows.map((r) => `${r.name}: ${r.stock}${r.unit}`).join('; ')
          : 'Nenhum produto em estoque baixo.',
      };
    },
  }),

  // ---------------------------------------------------------------- AGENDA
  tool({
    name: 'agendar_evento',
    description: 'Agenda um compromisso/reuniao.',
    schema: z.object({
      title: z.string().min(1),
      whenText: z.string().min(1).describe('Ex.: "amanha as 14h", "10/12 09:00"'),
      customerName: z.string().optional(),
      durationMin: z.number().int().positive().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
    }),
    async handler(a) {
      const startsAt = parseWhen(a.whenText);
      const customerId = await resolveCustomerId(a.customerName);
      const ev = await agenda.createEvent({
        title: a.title,
        startsAt,
        endsAt: a.durationMin ? new Date(startsAt.getTime() + a.durationMin * 60_000) : null,
        location: a.location ?? null,
        description: a.description ?? null,
        customerId,
      });
      return { id: ev.id, startsAt: ev.startsAt, message: `Agendado: ${ev.title} em ${ev.startsAt.toLocaleString('pt-BR')}.` };
    },
  }),

  tool({
    name: 'agenda_proximos',
    description: 'Lista os proximos compromissos.',
    schema: z.object({ days: z.number().int().positive().max(60).default(7) }),
    async handler(a) {
      const rows = await agenda.upcomingEvents(a.days);
      return {
        eventos: rows.map((e) => ({
          titulo: e.title,
          quando: e.startsAt,
          cliente: e.customer?.name ?? null,
        })),
      };
    },
  }),

  // -------------------------------------------------------------- RELATORIOS
  tool({
    name: 'visao_geral',
    description: 'Panorama do negocio: vendas de hoje, faturamento do mes, a receber, a pagar, estoque baixo.',
    schema: z.object({}),
    async handler() {
      return reports.overview();
    },
  }),
];

const schemaCache = new Map<string, ToolSchema>();

export function getToolSchemas(): ToolSchema[] {
  return tools.map((t) => {
    const cached = schemaCache.get(t.name);
    if (cached) return cached;
    const json = zodToJsonSchema(t.schema, { $refStrategy: 'none', target: 'openApi3' }) as Record<string, unknown>;
    delete json.$schema;
    const schema: ToolSchema = { name: t.name, description: t.description, parameters: json };
    schemaCache.set(t.name, schema);
    return schema;
  });
}

export interface ToolExecution {
  status: 'SUCCESS' | 'ERROR' | 'REJECTED';
  result?: unknown;
  error?: string;
}

export async function executeTool(name: string, rawArgs: unknown): Promise<ToolExecution> {
  const t = tools.find((x) => x.name === name);
  if (!t) return { status: 'ERROR', error: `Ferramenta desconhecida: ${name}` };

  const parsed = t.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      status: 'ERROR',
      error: `Argumentos invalidos para ${name}: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    };
  }

  try {
    const result = await t.handler(parsed.data);
    return { status: 'SUCCESS', result };
  } catch (err) {
    if (err instanceof NeedsClarification) {
      return {
        status: 'REJECTED',
        result: { needsClarification: true, question: err.question, candidates: err.candidates },
      };
    }
    if (isAppError(err)) return { status: 'ERROR', error: err.message };
    throw err;
  }
}
