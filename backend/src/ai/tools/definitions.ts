import { formatBRL } from '../../core/money';
import { defineTool, NeedsClarification, registerTools, z, type AiTool } from './registry';
import { parseDateOnly, parseWhen, periodRange, resolveCustomerId, resolveProduct } from './helpers';

import * as customers from '../../modules/customers/customers.service';
import * as suppliers from '../../modules/suppliers/suppliers.service';
import * as products from '../../modules/products/products.service';
import * as inventory from '../../modules/inventory/inventory.service';
import * as sales from '../../modules/sales/sales.service';
import * as finance from '../../modules/finance/finance.service';
import * as appointments from '../../modules/appointments/appointments.service';
import * as reports from '../../modules/reports/reports.service';
import * as charges from '../../modules/charges/charges.service';
import { sendToLinkedChannel } from '../../integrations/outbound';

const method = z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BOLETO', 'TRANSFER', 'OTHER']);
const confirm = z.boolean().optional().describe('Passe true apos o usuario confirmar a operacao');

const tools: AiTool[] = [
  // ============================================================ CLIENTES
  defineTool({
    name: 'create_customer',
    description: 'Cadastra um novo cliente.',
    permission: 'customer.create',
    schema: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
      document: z.string().optional(),
      addressLine: z.string().optional(),
      city: z.string().optional(),
      notes: z.string().optional(),
    }),
    async handler(a) {
      const c = await customers.createCustomer(a);
      return { id: c.id, name: c.name, message: `Cliente "${c.name}" cadastrado.` };
    },
  }),
  defineTool({
    name: 'find_customer',
    description: 'Busca um cliente por nome e retorna dados e saldo devedor.',
    permission: 'customer.read',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const res = await customers.findCustomerByName(a.name);
      if (!res.match) return { found: false, candidates: res.candidates };
      const balance = await customers.customerBalance(res.match.id);
      return { found: true, id: res.match.id, name: res.match.name, phone: res.match.phone, balance };
    },
  }),
  defineTool({
    name: 'update_customer',
    description: 'Atualiza dados de um cliente existente.',
    permission: 'customer.update',
    schema: z.object({
      name: z.string().min(1).describe('nome atual do cliente para localiza-lo'),
      newName: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
    }),
    async handler(a) {
      const id = await resolveCustomerId(a.name);
      if (!id) return { error: `Cliente "${a.name}" nao encontrado.` };
      const c = await customers.updateCustomer(id, {
        name: a.newName,
        phone: a.phone,
        whatsapp: a.whatsapp,
        email: a.email,
        notes: a.notes,
      });
      return { id: c.id, message: `Cliente atualizado.` };
    },
  }),
  defineTool({
    name: 'list_customers',
    description: 'Lista clientes (opcionalmente filtrando por texto).',
    permission: 'customer.read',
    schema: z.object({ search: z.string().optional(), limit: z.number().int().max(50).default(20) }),
    async handler(a) {
      const { items } = await customers.listCustomers({ page: 1, pageSize: a.limit, search: a.search });
      return { customers: items.map((c) => ({ id: c.id, name: c.name, phone: c.phone })) };
    },
  }),
  defineTool({
    name: 'customer_history',
    description: 'Historico do cliente: compras, contas a receber e pagamentos.',
    permission: 'customer.read',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const id = await resolveCustomerId(a.name);
      if (!id) return { error: `Cliente "${a.name}" nao encontrado.` };
      return customers.customerHistory(id);
    },
  }),

  // ============================================================ FORNECEDORES
  defineTool({
    name: 'create_supplier',
    description: 'Cadastra um fornecedor.',
    permission: 'supplier.create',
    schema: z.object({ name: z.string().min(1), phone: z.string().optional(), document: z.string().optional() }),
    async handler(a) {
      const s = await suppliers.createSupplier(a);
      return { id: s.id, message: `Fornecedor "${s.name}" cadastrado.` };
    },
  }),
  defineTool({
    name: 'find_supplier',
    description: 'Busca um fornecedor por nome.',
    permission: 'supplier.read',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const s = await suppliers.findSupplierByName(a.name);
      return s ? { found: true, id: s.id, name: s.name } : { found: false };
    },
  }),

  // ============================================================ PRODUTOS
  defineTool({
    name: 'create_product',
    description: 'Cadastra um produto no catalogo.',
    permission: 'product.create',
    schema: z.object({
      name: z.string().min(1),
      price: z.number().nonnegative(),
      cost: z.number().nonnegative().optional(),
      stock: z.number().nonnegative().optional(),
      minStock: z.number().nonnegative().optional(),
      unit: z.string().optional(),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      categoryName: z.string().optional(),
    }),
    async handler(a) {
      const p = await products.createProduct(a);
      return { id: p.id, name: p.name, message: `Produto "${p.name}" cadastrado a ${formatBRL(p.price)}.` };
    },
  }),
  defineTool({
    name: 'find_product',
    description: 'Busca um produto por nome/codigo e retorna preco e estoque.',
    permission: 'product.read',
    schema: z.object({ name: z.string().min(1) }),
    async handler(a) {
      const res = await products.findProductByName(a.name);
      if (!res.match) return { found: false, candidates: res.candidates };
      return {
        found: true,
        id: res.match.id,
        name: res.match.name,
        price: res.match.price.toNumber(),
        stock: res.match.inventory?.quantity.toNumber() ?? 0,
        unit: res.match.unit,
      };
    },
  }),
  defineTool({
    name: 'search_product',
    description: 'Lista produtos que correspondem a um texto.',
    permission: 'product.read',
    schema: z.object({ query: z.string().min(1), limit: z.number().int().max(30).default(10) }),
    async handler(a) {
      const { items } = await products.listProducts({ page: 1, pageSize: a.limit, search: a.query });
      return {
        products: items.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price.toNumber(),
          stock: p.inventory?.quantity.toNumber() ?? 0,
        })),
      };
    },
  }),
  defineTool({
    name: 'update_product',
    description: 'Atualiza preco, custo ou estoque minimo de um produto.',
    permission: 'product.update',
    schema: z.object({
      name: z.string().min(1),
      price: z.number().nonnegative().optional(),
      cost: z.number().nonnegative().optional(),
      minStock: z.number().nonnegative().optional(),
    }),
    async handler(a) {
      const p = await resolveProduct(a.name);
      await products.updateProduct(p.id, { price: a.price, cost: a.cost, minStock: a.minStock });
      return { id: p.id, message: `Produto "${p.name}" atualizado.` };
    },
  }),
  defineTool({
    name: 'list_products',
    description: 'Lista produtos do catalogo.',
    permission: 'product.read',
    schema: z.object({ limit: z.number().int().max(50).default(20) }),
    async handler(a) {
      const { items } = await products.listProducts({ page: 1, pageSize: a.limit });
      return { products: items.map((p) => ({ id: p.id, name: p.name, price: p.price.toNumber() })) };
    },
  }),

  // ============================================================ ESTOQUE
  defineTool({
    name: 'add_stock',
    description: 'Registra entrada de estoque de um produto.',
    permission: 'inventory.move',
    schema: z.object({ product: z.string().min(1), quantity: z.number().positive(), reason: z.string().optional() }),
    async handler(a) {
      const p = await resolveProduct(a.product);
      const r = await inventory.registerMovement({ productId: p.id, type: 'IN', quantity: a.quantity, reason: a.reason });
      return { product: p.name, balance: r.balanceAfter, message: `Entrada registrada. Saldo: ${r.balanceAfter}.` };
    },
  }),
  defineTool({
    name: 'remove_stock',
    description: 'Registra saida/baixa de estoque (perda, uso interno).',
    permission: 'inventory.move',
    schema: z.object({ product: z.string().min(1), quantity: z.number().positive(), reason: z.string().optional() }),
    async handler(a) {
      const p = await resolveProduct(a.product);
      const r = await inventory.registerMovement({ productId: p.id, type: 'OUT', quantity: a.quantity, reason: a.reason });
      return { product: p.name, balance: r.balanceAfter, message: `Saida registrada. Saldo: ${r.balanceAfter}.` };
    },
  }),
  defineTool({
    name: 'adjust_stock',
    description: 'Define o saldo de estoque de um produto (contagem/inventario).',
    permission: 'inventory.move',
    schema: z.object({ product: z.string().min(1), quantity: z.number().nonnegative(), reason: z.string().optional() }),
    async handler(a) {
      const p = await resolveProduct(a.product);
      const r = await inventory.registerMovement({ productId: p.id, type: 'ADJUST', quantity: a.quantity, reason: a.reason });
      return { product: p.name, balance: r.balanceAfter, message: `Saldo ajustado para ${r.balanceAfter}.` };
    },
  }),
  defineTool({
    name: 'get_stock',
    description: 'Consulta o estoque atual de um produto.',
    permission: 'inventory.read',
    schema: z.object({ product: z.string().min(1) }),
    async handler(a) {
      const p = await resolveProduct(a.product);
      return inventory.getStock(p.id);
    },
  }),
  defineTool({
    name: 'low_stock_products',
    description: 'Lista produtos no estoque minimo ou abaixo.',
    permission: 'inventory.read',
    schema: z.object({}),
    async handler() {
      const rows = await products.lowStockProducts();
      return {
        products: rows,
        message: rows.length ? rows.map((r) => `${r.name}: ${r.stock}${r.unit}`).join('; ') : 'Nenhum produto em estoque baixo.',
      };
    },
  }),
  defineTool({
    name: 'stock_history',
    description: 'Ultimas movimentacoes de estoque de um produto.',
    permission: 'inventory.read',
    schema: z.object({ product: z.string().min(1), limit: z.number().int().max(50).default(15) }),
    async handler(a) {
      const p = await resolveProduct(a.product);
      const { items } = await inventory.listMovements({ page: 1, pageSize: a.limit, productId: p.id });
      return {
        product: p.name,
        movements: items.map((m) => ({ type: m.type, quantity: m.quantity.toNumber(), balance: m.balanceAfter.toNumber(), when: m.createdAt, reason: m.reason })),
      };
    },
  }),

  // ============================================================ VENDAS
  defineTool({
    name: 'create_sale',
    description:
      'Registra uma venda. Informe paidAmount quando o cliente pagar apenas parte; omita paidAmount para pagamento integral, ou 0 para fiado.',
    permission: 'sale.create',
    schema: z.object({
      items: z
        .array(
          z.object({
            product: z.string().describe('nome do produto/item'),
            quantity: z.number().positive(),
            unitPrice: z.number().nonnegative().optional().describe('omita para usar o preco do catalogo'),
          }),
        )
        .min(1),
      customerName: z.string().optional(),
      paymentMethod: method.optional(),
      discount: z.number().nonnegative().optional(),
      paidAmount: z.number().nonnegative().optional(),
      dueDateText: z.string().optional().describe('vencimento do fiado, ex.: "amanha", "10/12"'),
    }),
    async handler(a) {
      const customerId = await resolveCustomerId(a.customerName, { createIfMissing: true });
      const items = [];
      for (const it of a.items) {
        let productId: string | undefined;
        let unitPrice = it.unitPrice;
        try {
          const p = await resolveProduct(it.product);
          productId = p.id;
          unitPrice = unitPrice ?? p.price;
        } catch (err) {
          if (err instanceof NeedsClarification) throw err;
        }
        items.push({ productId, description: it.product, quantity: it.quantity, unitPrice });
      }
      const sale = await sales.createSale({
        items,
        customerId,
        paymentMethod: a.paymentMethod ?? null,
        discount: a.discount,
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
  defineTool({
    name: 'get_sale',
    description: 'Detalhes de uma venda pelo numero.',
    permission: 'sale.read',
    schema: z.object({ number: z.number().int().positive() }),
    async handler(a) {
      const { items } = await sales.listSales({ page: 1, pageSize: 1, status: undefined });
      const found = items.find((s) => s.number === a.number);
      if (!found) return { error: `Venda #${a.number} nao encontrada.` };
      return sales.getSale(found.id);
    },
  }),
  defineTool({
    name: 'list_sales',
    description: 'Lista vendas recentes (opcional: periodo hoje/ontem/mes).',
    permission: 'sale.read.own',
    schema: z.object({ period: z.enum(['hoje', 'ontem', 'mes']).optional(), limit: z.number().int().max(50).default(20) }),
    async handler(a) {
      const r = a.period ? periodRange(a.period) : undefined;
      const { items } = await sales.listSales({ page: 1, pageSize: a.limit, from: r?.from, to: r?.to });
      return {
        sales: items.map((s) => ({
          number: s.number,
          customer: s.customer?.name ?? null,
          total: s.total.toNumber(),
          status: s.status,
          soldAt: s.soldAt,
        })),
      };
    },
  }),
  defineTool({
    name: 'cancel_sale',
    description: 'Cancela uma venda pelo numero e estorna estoque e financeiro. Operacao de risco.',
    permission: 'sale.cancel',
    destructive: true,
    schema: z.object({ number: z.number().int().positive(), reason: z.string().optional(), confirm }),
    async handler(a) {
      const { items } = await sales.listSales({ page: 1, pageSize: 50 });
      const found = items.find((s) => s.number === a.number);
      if (!found) return { error: `Venda #${a.number} nao encontrada.` };
      const res = await sales.cancelSale(found.id, a.reason);
      return { ...res, message: `Venda #${res.number} cancelada.` };
    },
  }),
  defineTool({
    name: 'sales_summary',
    description: 'Total de vendas de um periodo (hoje, ontem ou mes).',
    permission: 'sale.read.own',
    schema: z.object({ period: z.enum(['hoje', 'ontem', 'mes']).default('hoje') }),
    async handler(a) {
      const r = periodRange(a.period);
      const s = await sales.salesSummary({ from: r.from, to: r.to });
      return {
        period: r.label,
        count: s.count,
        gross: s.gross,
        received: s.received,
        pending: s.pending,
        message: `Vendas ${r.label}: ${s.count} venda(s), total ${formatBRL(s.gross)} (recebido ${formatBRL(s.received)}, a receber ${formatBRL(s.pending)}).`,
      };
    },
  }),

  // ============================================================ FINANCEIRO
  defineTool({
    name: 'create_income',
    description: 'Registra uma receita avulsa (entrada de dinheiro que nao e venda).',
    permission: 'finance.create',
    schema: z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      category: z.string().optional(),
      method: method.optional(),
      date: z.string().optional().describe('ex.: "hoje", "ontem", "05/12"'),
    }),
    async handler(a) {
      const t = await finance.createIncome({
        amount: a.amount,
        description: a.description,
        categoryName: a.category,
        method: a.method ?? null,
        date: a.date ? parseDateOnly(a.date) : undefined,
      });
      return { id: t.id, message: `Receita de ${formatBRL(t.amount)} registrada.` };
    },
  }),
  defineTool({
    name: 'create_expense',
    description: 'Registra uma despesa (saida de dinheiro ja paga).',
    permission: 'finance.create',
    schema: z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      category: z.string().optional().describe('ex.: Energia, Agua, Combustivel, Aluguel'),
      method: method.optional(),
      date: z.string().optional(),
    }),
    async handler(a) {
      const t = await finance.createExpense({
        amount: a.amount,
        description: a.description,
        categoryName: a.category,
        method: a.method ?? null,
        date: a.date ? parseDateOnly(a.date) : undefined,
      });
      return { id: t.id, message: `Despesa de ${formatBRL(t.amount)} registrada e marcada como paga.` };
    },
  }),
  defineTool({
    name: 'create_receivable',
    description: 'Cria uma conta a receber (cobranca futura de um cliente).',
    permission: 'finance.create',
    schema: z.object({
      customerName: z.string().optional(),
      description: z.string().min(1),
      amount: z.number().positive(),
      dueDateText: z.string().optional(),
    }),
    async handler(a) {
      const customerId = (await resolveCustomerId(a.customerName)) ?? undefined;
      const r = await finance.createReceivable({
        customerId,
        description: a.description,
        amount: a.amount,
        dueDate: a.dueDateText ? parseDateOnly(a.dueDateText) : null,
      });
      return { id: r.id, message: `Conta a receber criada: ${formatBRL(a.amount)}.` };
    },
  }),
  defineTool({
    name: 'create_payable',
    description: 'Cria uma conta a pagar (compromisso futuro com fornecedor).',
    permission: 'finance.create',
    schema: z.object({
      supplierName: z.string().optional(),
      description: z.string().min(1),
      amount: z.number().positive(),
      dueDateText: z.string().optional(),
    }),
    async handler(a) {
      const supplier = a.supplierName ? await suppliers.findSupplierByName(a.supplierName) : null;
      const p = await finance.createPayable({
        supplierId: supplier?.id ?? null,
        description: a.description,
        amount: a.amount,
        dueDate: a.dueDateText ? parseDateOnly(a.dueDateText) : null,
      });
      return { id: p.id, message: `Conta a pagar criada: ${formatBRL(a.amount)}.` };
    },
  }),
  defineTool({
    name: 'register_payment',
    description:
      'Registra um pagamento. Sem accountPayableId, abate contas a receber do cliente (recebimento). Com accountPayableId, paga uma conta a pagar.',
    permission: 'finance.manage',
    schema: z.object({
      amount: z.number().positive(),
      customerName: z.string().optional(),
      accountPayableSearch: z.string().optional().describe('texto para localizar a conta a pagar'),
      method: method.optional(),
    }),
    async handler(a) {
      if (a.accountPayableSearch) {
        const matches = await finance.findPayable(a.accountPayableSearch);
        if (matches.length === 0) return { error: `Nenhuma conta a pagar com "${a.accountPayableSearch}".` };
        if (matches.length > 1)
          throw new NeedsClarification(
            'Qual conta a pagar?',
            matches.map((m) => ({ id: m.id, description: m.description, valor: m.amount.toNumber() })),
          );
        const res = await finance.registerPayment({ amount: a.amount, accountPayableId: matches[0]!.id, method: a.method ?? null });
        return { ...res, message: `Pagamento de ${formatBRL(a.amount)} registrado.` };
      }
      const customerId = (await resolveCustomerId(a.customerName)) ?? undefined;
      const res = await finance.registerPayment({ amount: a.amount, customerId, method: a.method ?? null });
      return { ...res, message: `Recebimento de ${formatBRL(a.amount)} registrado.` };
    },
  }),
  defineTool({
    name: 'get_cash_flow',
    description: 'Fluxo de caixa do mes (ou mes informado): entradas, saidas e saldo.',
    permission: 'finance.read',
    schema: z.object({ monthText: z.string().optional() }),
    async handler(a) {
      const ref = a.monthText ? parseDateOnly(a.monthText) : new Date();
      const cf = await finance.monthRevenue(ref);
      return { ...cf, message: `Entradas ${formatBRL(cf.income)} | Saidas ${formatBRL(cf.expense)} | Saldo ${formatBRL(cf.net)}.` };
    },
  }),
  defineTool({
    name: 'get_balance',
    description: 'Saldo acumulado (todas as entradas menos saidas).',
    permission: 'finance.read',
    schema: z.object({}),
    async handler() {
      const b = await finance.balance();
      return { balance: b, message: `Saldo atual: ${formatBRL(b)}.` };
    },
  }),
  defineTool({
    name: 'get_receivables',
    description: 'Total a receber (em aberto e vencidos separadamente).',
    permission: 'finance.read',
    schema: z.object({}),
    async handler() {
      const t = await finance.totalReceivable();
      return {
        total: t.total,
        overdue: t.overdue,
        message: `Voce possui ${formatBRL(t.total)} para receber. ${formatBRL(t.total - t.overdue)} em aberto, ${formatBRL(t.overdue)} vencidos.`,
      };
    },
  }),
  defineTool({
    name: 'get_payables',
    description: 'Total a pagar (em aberto e vencidos separadamente).',
    permission: 'finance.read',
    schema: z.object({}),
    async handler() {
      const t = await finance.totalPayable();
      return {
        total: t.total,
        overdue: t.overdue,
        message: `Voce tem ${formatBRL(t.total)} a pagar, sendo ${formatBRL(t.overdue)} vencidos.`,
      };
    },
  }),
  defineTool({
    name: 'get_overdue_accounts',
    description: 'Lista contas a receber e a pagar vencidas.',
    permission: 'finance.read',
    schema: z.object({}),
    async handler() {
      return finance.overdueAccounts();
    },
  }),

  // ============================================================ AGENDA
  defineTool({
    name: 'create_appointment',
    description: 'Agenda um compromisso. Interprete "amanha", "sexta as 15h", "daqui a 2 horas".',
    permission: 'appointment.manage',
    schema: z.object({
      title: z.string().min(1),
      whenText: z.string().min(1),
      customerName: z.string().optional(),
      durationMin: z.number().int().positive().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
    }),
    async handler(a) {
      const startsAt = parseWhen(a.whenText);
      const customerId = await resolveCustomerId(a.customerName);
      const ev = await appointments.createAppointment({
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
  defineTool({
    name: 'update_appointment',
    description: 'Reagenda ou altera um compromisso pelo titulo.',
    permission: 'appointment.manage',
    schema: z.object({ title: z.string().min(1), whenText: z.string().optional(), location: z.string().optional() }),
    async handler(a) {
      const { items } = await appointments.listAppointments({ page: 1, pageSize: 50, status: 'SCHEDULED' });
      const found = items.find((e) => e.title.toLowerCase().includes(a.title.toLowerCase()));
      if (!found) return { error: `Compromisso "${a.title}" nao encontrado.` };
      const ev = await appointments.updateAppointment(found.id, {
        startsAt: a.whenText ? parseWhen(a.whenText) : undefined,
        location: a.location,
      });
      return { id: ev.id, message: 'Compromisso atualizado.' };
    },
  }),
  defineTool({
    name: 'cancel_appointment',
    description: 'Cancela um compromisso pelo titulo. Operacao de risco.',
    permission: 'appointment.manage',
    destructive: true,
    schema: z.object({ title: z.string().min(1), confirm }),
    async handler(a) {
      const { items } = await appointments.listAppointments({ page: 1, pageSize: 50, status: 'SCHEDULED' });
      const found = items.find((e) => e.title.toLowerCase().includes(a.title.toLowerCase()));
      if (!found) return { error: `Compromisso "${a.title}" nao encontrado.` };
      await appointments.cancelAppointment(found.id);
      return { message: `Compromisso "${found.title}" cancelado.` };
    },
  }),
  defineTool({
    name: 'list_appointments',
    description: 'Lista compromissos agendados.',
    permission: 'appointment.read',
    schema: z.object({ limit: z.number().int().max(50).default(20) }),
    async handler(a) {
      const { items } = await appointments.listAppointments({ page: 1, pageSize: a.limit, status: 'SCHEDULED' });
      return { appointments: items.map((e) => ({ title: e.title, when: e.startsAt, customer: e.customer?.name ?? null })) };
    },
  }),
  defineTool({
    name: 'get_today_appointments',
    description: 'Compromissos de hoje.',
    permission: 'appointment.read',
    schema: z.object({}),
    async handler() {
      const rows = await appointments.todayAppointments();
      return { appointments: rows.map((e) => ({ title: e.title, when: e.startsAt, customer: e.customer?.name ?? null })) };
    },
  }),
  defineTool({
    name: 'get_upcoming_appointments',
    description: 'Proximos compromissos (padrao 7 dias).',
    permission: 'appointment.read',
    schema: z.object({ days: z.number().int().positive().max(60).default(7) }),
    async handler(a) {
      const rows = await appointments.upcomingAppointments(a.days);
      return { appointments: rows.map((e) => ({ title: e.title, when: e.startsAt, customer: e.customer?.name ?? null })) };
    },
  }),

  // ============================================================ RELATORIOS
  defineTool({
    name: 'get_sales_report',
    description: 'Relatorio de vendas: total, por dia, mais vendidos e por vendedor.',
    permission: 'report.read',
    schema: z.object({ period: z.enum(['today', 'yesterday', 'week', 'month']).default('today') }),
    async handler(a) {
      return reports.salesReport(a.period);
    },
  }),
  defineTool({
    name: 'get_financial_report',
    description: 'Relatorio financeiro: entradas, saidas, saldo, a receber, a pagar, despesas por categoria.',
    permission: 'report.finance.read',
    schema: z.object({ period: z.enum(['week', 'month']).default('month') }),
    async handler(a) {
      return reports.financialReport(a.period);
    },
  }),
  defineTool({
    name: 'get_profit_report',
    description: 'Lucro estimado do periodo (receita - custo dos produtos - despesas).',
    permission: 'report.finance.read',
    schema: z.object({ period: z.enum(['week', 'month']).default('month') }),
    async handler(a) {
      return reports.profitReport(a.period);
    },
  }),
  defineTool({
    name: 'get_inventory_report',
    description: 'Relatorio de estoque: valor total e itens em falta.',
    permission: 'report.read',
    schema: z.object({}),
    async handler() {
      return reports.inventoryReport();
    },
  }),
  defineTool({
    name: 'get_customer_report',
    description: 'Relatorio de clientes: total, novos no mes, maiores compradores, inadimplencia.',
    permission: 'report.read',
    schema: z.object({}),
    async handler() {
      return reports.customerReport();
    },
  }),
  defineTool({
    name: 'get_seller_report',
    description: 'Desempenho por vendedor no periodo.',
    permission: 'report.read',
    schema: z.object({ period: z.enum(['week', 'month']).default('month') }),
    async handler(a) {
      return reports.sellerReport(a.period);
    },
  }),

  // ============================================================ COBRANCAS
  defineTool({
    name: 'list_overdue_customers',
    description: 'Lista clientes em atraso com valor e dias de atraso.',
    permission: 'charge.read',
    schema: z.object({}),
    async handler() {
      return { overdue: await charges.overdueCustomers() };
    },
  }),
  defineTool({
    name: 'create_charge',
    description: 'Cria uma cobranca para uma conta a receber e gera a mensagem.',
    permission: 'charge.manage',
    schema: z.object({
      customerName: z.string().min(1),
      autoReminder: z.boolean().optional(),
    }),
    async handler(a) {
      const overdue = await charges.overdueCustomers();
      const target = overdue.find((o) => (o.customer ?? '').toLowerCase().includes(a.customerName.toLowerCase()));
      if (!target) return { error: `Nao encontrei conta em atraso para "${a.customerName}".` };
      const charge = await charges.createCharge({
        accountReceivableId: target.accountReceivableId,
        autoReminder: a.autoReminder,
      });
      return { id: charge.id, message: charge.message, preview: charge.message };
    },
  }),
  defineTool({
    name: 'send_charge',
    description: 'Envia uma cobranca ja criada pelo canal disponivel do cliente.',
    permission: 'charge.manage',
    schema: z.object({ chargeId: z.string().min(1) }),
    async handler(a) {
      const res = await charges.sendCharge(a.chargeId);
      return { delivered: res.delivered, message: res.delivered ? 'Cobranca enviada.' : 'Cobranca registrada (nenhum canal conectado).' };
    },
  }),

  // ============================================================ MENSAGENS
  defineTool({
    name: 'send_message',
    description: 'Envia uma mensagem de texto a um cliente pelo canal disponivel (WhatsApp/Telegram).',
    permission: 'charge.manage',
    schema: z.object({ customerName: z.string().min(1), text: z.string().min(1) }),
    async handler(a) {
      const res = await customers.findCustomerByName(a.customerName);
      if (!res.match) return { error: `Cliente "${a.customerName}" nao encontrado.` };
      const phone = res.match.whatsapp ?? res.match.phone ?? null;
      const delivered = await sendToLinkedChannel({ customerPhone: phone, text: a.text });
      return { delivered, message: delivered ? 'Mensagem enviada.' : 'Nenhum canal conectado para este contato.' };
    },
  }),
];

registerTools(tools);
