import { randomUUID } from 'node:crypto';
import type { AIProvider, ChatRequest, ChatResponse, ChatToolCall } from './types';

/**
 * Provedor deterministico para testes e uso offline (AI_PROVIDER=stub).
 * Extrai por regex as intencoes mais comuns em PT-BR e aciona as tools reais.
 * NAO substitui um modelo - cobre o caminho feliz para validar a stack.
 */

function num(s: string): number {
  return Number(
    s
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, ''),
  );
}

function call(name: string, args: Record<string, unknown>): ChatToolCall {
  return { id: `stub_${randomUUID().slice(0, 8)}`, name, arguments: JSON.stringify(args) };
}

function detect(text: string): ChatToolCall[] {
  const t = text.toLowerCase().trim();
  let m: RegExpMatchArray | null;

  // Venda: "Joao comprou 3 camisas por 80 reais cada e pagou no Pix"
  if (
    (m = t.match(/(?:vend\w+|comprou|comprei)\s+(?:de\s+)?(\d[\d.,]*)\s+([a-zà-ÿ\s]+?)\s+(?:por|a)\s+(\d[\d.,]*)/))
  ) {
    const customer = t.match(/^([a-zà-ÿ\s]+?)\s+comprou/) ?? t.match(/para\s+([a-zà-ÿ\s]+?)(?:\s|$|,|\.)/);
    const pay = /pix/.test(t) ? 'PIX' : /dinheiro/.test(t) ? 'CASH' : /d[eé]bito/.test(t) ? 'DEBIT' : /cr[eé]dito/.test(t) ? 'CREDIT' : undefined;
    const fiado = /fiado|anota|depois|a prazo/.test(t);
    return [
      call('create_sale', {
        items: [{ product: m[2]!.trim(), quantity: num(m[1]!), unitPrice: num(m[3]!) }],
        customerName: customer?.[1]?.trim(),
        paymentMethod: pay,
        paidAmount: fiado ? 0 : undefined,
      }),
    ];
  }

  // Despesa: "Paguei 120 reais de energia"
  if ((m = t.match(/(?:paguei|gastei|despesa de|gasto de)\s+(\d[\d.,]*)\s*(?:reais\s+)?(?:de|com|no|na)?\s*([a-zà-ÿ\s]+)?/))) {
    return [call('create_expense', { amount: num(m[1]!), description: (m[2]?.trim() || 'Despesa'), category: m[2]?.trim() })];
  }

  // Recebimento: "Joao me pagou 300" / "recebi 300 de Joao"
  if ((m = t.match(/([a-zà-ÿ\s]+?)\s+me\s+pagou\s+(\d[\d.,]*)/))) {
    return [call('register_payment', { customerName: m[1]!.trim(), amount: num(m[2]!) })];
  }
  if ((m = t.match(/recebi\s+(\d[\d.,]*)\s+(?:reais\s+)?d[eo]\s+([a-zà-ÿ\s]+)/))) {
    return [call('register_payment', { customerName: m[2]!.trim(), amount: num(m[1]!) })];
  }

  // Cliente: "cadastre Maria como cliente"
  if ((m = t.match(/cadastr\w*\s+([a-zà-ÿ\s]+?)\s+como\s+cliente/)) || (m = t.match(/nov[ao]\s+cliente\s+([a-zà-ÿ\s]+)/))) {
    return [call('create_customer', { name: m[1]!.trim() })];
  }

  if (/quanto\s+vendi|vendas\s+de\s+hoje|total\s+de\s+vendas/.test(t)) {
    return [call('sales_summary', { period: /ontem/.test(t) ? 'ontem' : /m[eê]s/.test(t) ? 'mes' : 'hoje' })];
  }
  if (/(a|para)\s+receber|tenho\s+.*receber/.test(t)) return [call('get_receivables', {})];
  if (/(a|para)\s+pagar|tenho\s+.*pagar/.test(t)) return [call('get_payables', {})];
  if (/quem\s+(est\w*\s+devendo|me\s+deve|deve)|inadimpl/.test(t)) return [call('list_overdue_customers', {})];
  if (/estoque\s+baixo|acaba\w*|falta\w*\s+no\s+estoque/.test(t)) return [call('low_stock_products', {})];
  if (/faturamento|fluxo\s+de\s+caixa/.test(t)) return [call('get_cash_flow', {})];
  if (/lucro/.test(t)) return [call('get_profit_report', { period: 'month' })];
  if (/saldo/.test(t)) return [call('get_balance', {})];
  if (/compromissos?\s+de\s+hoje|agenda\s+de\s+hoje/.test(t)) return [call('get_today_appointments', {})];

  if ((m = t.match(/(?:marqu\w*|agend\w*)\s+(?:uma\s+)?([a-zà-ÿ\s]+?)\s+com\s+([a-zà-ÿ\s]+?)\s+(.+)$/))) {
    return [call('create_appointment', { title: m[1]!.trim(), customerName: m[2]!.trim(), whenText: m[3]!.trim() })];
  }

  return [];
}

const brl = (v: unknown) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

function summarize(toolName: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (r.error) return `Nao consegui: ${String(r.error)}`;
  if (r.needsClarification) return String(r.question);
  if (r.needsConfirmation) return String(r.prompt);
  if (typeof r.message === 'string') return r.message;

  switch (toolName) {
    case 'sales_summary':
      return `Vendas ${r.period ?? 'hoje'}: ${r.count} venda(s), total ${brl(r.gross)} (recebido ${brl(r.received)}, a receber ${brl(r.pending)}).`;
    case 'get_profit_report':
      return `Lucro estimado (${r.period ?? 'mes'}): ${brl(r.estimatedProfit)}. Receita ${brl(r.revenue)} - custo ${brl(r.cogs)} - despesas ${brl(r.otherExpenses)}.`;
    case 'get_today_appointments':
    case 'list_appointments':
    case 'get_upcoming_appointments': {
      const list = (r.appointments as { title: string; when: string }[]) ?? [];
      return list.length
        ? list.map((a) => `- ${a.title} (${new Date(a.when).toLocaleString('pt-BR')})`).join('\n')
        : 'Nenhum compromisso.';
    }
    case 'get_overdue_accounts': {
      const rec = (r.receivables as unknown[])?.length ?? 0;
      const pay = (r.payables as unknown[])?.length ?? 0;
      return `Vencidos: ${rec} conta(s) a receber e ${pay} a pagar.`;
    }
    default:
      return 'Feito.';
  }
}

export class StubProvider implements AIProvider {
  readonly id = 'stub';
  readonly model = 'stub-rules-v1';

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const last = [...req.messages].reverse().find((m) => m.role === 'user' || m.role === 'tool');

    if (last?.role === 'tool') {
      const prevAssistant = [...req.messages].reverse().find((m) => m.role === 'assistant' && m.toolCalls?.length);
      const toolName = prevAssistant?.toolCalls?.[0]?.name ?? 'tool';
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(last.content);
      } catch {
        parsed = last.content;
      }
      return { content: summarize(toolName, parsed), toolCalls: [] };
    }

    const toolCalls = detect(last?.content ?? '');
    if (toolCalls.length > 0) return { content: '', toolCalls };
    return {
      content:
        'Entendi sua mensagem, mas nao identifiquei uma acao clara. Diga o valor e a operacao (ex.: "paguei 120 de energia").',
      toolCalls: [],
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'stub sempre disponivel' };
  }
}
