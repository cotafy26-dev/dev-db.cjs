import { randomUUID } from 'node:crypto';
import type { AIProvider, ChatRequest, ChatResponse, ChatToolCall } from './types';

/**
 * Provedor deterministico para testes e uso offline (AI_PROVIDER=stub).
 * Faz uma extracao simples por regex das intencoes mais comuns em PT-BR.
 * NAO substitui um modelo real - cobre o "caminho feliz" para validar a stack.
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

  if ((m = t.match(/despesa|gasto|paguei .* de/) )) {
    const val = t.match(/(\d[\d.,]*)/);
    const desc = t.match(/de\s+[\d.,]+\s+(?:reais\s+)?(?:de|com|no|na)\s+(.+)$/) ?? t.match(/(?:de|com)\s+([a-zà-ÿ\s]+)$/);
    if (val) return [call('registrar_despesa', { amount: num(val[1]!), description: desc?.[1]?.trim() || 'Despesa' })];
  }

  if ((m = t.match(/(.+?)\s+me\s+pagou\s+(\d[\d.,]*)/)) || (m = t.match(/recebi\s+(\d[\d.,]*)\s+(?:reais\s+)?d[eo]\s+(.+)/))) {
    if (/me\s+pagou/.test(t)) return [call('registrar_recebimento', { customerName: m[1]!.trim(), amount: num(m[2]!) })];
    return [call('registrar_recebimento', { customerName: m[2]!.trim(), amount: num(m[1]!) })];
  }

  if ((m = t.match(/cadastr\w*\s+(.+?)\s+como\s+cliente/)) || (m = t.match(/nov[ao]\s+cliente\s+(.+)/))) {
    return [call('cadastrar_cliente', { name: m[1]!.trim() })];
  }

  if (/quanto\s+vendi|vendas\s+de\s+hoje|total\s+de\s+vendas/.test(t)) {
    const period = /ontem/.test(t) ? 'ontem' : /m[eê]s/.test(t) ? 'mes' : 'hoje';
    return [call('resumo_vendas', { period })];
  }

  if (/a\s+receber|para\s+receber|tenho\s+.*receber/.test(t)) return [call('total_a_receber', {})];
  if (/quem\s+(est\w*\s+devendo|me\s+deve|deve)/.test(t)) return [call('lista_devedores', {})];
  if (/contas?\s+(a\s+)?venc\w+|vence\w*\s+amanh|o\s+que\s+vence/.test(t)) {
    return [call('contas_a_vencer', { until: /amanh/.test(t) ? 'amanha' : 'hoje' })];
  }
  if (/estoque\s+baixo|acaba\w*|falta\w*\s+no\s+estoque/.test(t)) return [call('produtos_estoque_baixo', {})];
  if (/faturamento\s+d\w*\s+m[eê]s|faturamento\s+mensal/.test(t)) return [call('faturamento_mes', {})];

  if ((m = t.match(/registr\w*\s+(?:uma\s+)?venda\s+de\s+(\d[\d.,]*)\s+(.+?)\s+(?:por|a)\s+(\d[\d.,]*)/))) {
    const customer = t.match(/para\s+([a-zà-ÿ\s]+?)(?:\s+no\s+|\s+em\s+|\s*$)/);
    const pay = /pix/.test(t) ? 'PIX' : /dinheiro/.test(t) ? 'CASH' : /cart[aã]o|d[eé]bito/.test(t) ? 'DEBIT' : /cr[eé]dito/.test(t) ? 'CREDIT' : /fiado|depois/.test(t) ? null : null;
    return [
      call('registrar_venda', {
        items: [{ description: m[2]!.trim(), quantity: num(m[1]!), unitPrice: num(m[3]!) }],
        customerName: customer?.[1]?.trim(),
        paymentMethod: pay,
        fiado: /fiado|depois|anota/.test(t),
      }),
    ];
  }

  if ((m = t.match(/(?:marqu\w*|agend\w*)\s+(?:uma\s+)?(.+?)\s+com\s+(.+?)\s+(.+)$/))) {
    return [call('agendar_evento', { title: m[1]!.trim(), customerName: m[2]!.trim(), whenText: m[3]!.trim() })];
  }

  if ((m = t.match(/(?:tenho|registr\w*|coloca)\s+(\d[\d.,]*)\s+(?:unidades?\s+)?(?:de\s+|desse\s+produto\s*)?(.+?)?\s*(?:no\s+estoque)?$/))) {
    if (m[2]) return [call('ajustar_estoque', { productName: m[2]!.trim(), quantity: num(m[1]!) })];
  }

  return [];
}

function summarize(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  if (r?.error) return `Nao consegui: ${String(r.error)}`;
  switch (toolName) {
    case 'registrar_despesa':
      return `Despesa registrada: ${r.description} - R$ ${Number(r.amount).toFixed(2)}.`;
    case 'registrar_recebimento':
      return `Recebimento registrado.`;
    case 'cadastrar_cliente':
      return `Cliente "${r.name}" cadastrado.`;
    case 'resumo_vendas':
      return `Vendas ${r.period}: ${r.count} venda(s), total R$ ${Number(r.gross).toFixed(2)} (recebido R$ ${Number(r.received).toFixed(2)}).`;
    case 'total_a_receber':
      return `Total a receber: R$ ${Number(r.total).toFixed(2)}.`;
    case 'faturamento_mes':
      return `Faturamento do mes: R$ ${Number(r.income).toFixed(2)} | Despesas: R$ ${Number(r.expense).toFixed(2)} | Saldo: R$ ${Number(r.net).toFixed(2)}.`;
    case 'registrar_venda':
      return `Venda #${r.number} registrada: total R$ ${Number(r.total).toFixed(2)}.`;
    default:
      return `Feito. ${JSON.stringify(result).slice(0, 500)}`;
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
    if (toolCalls.length > 0) {
      return { content: '', toolCalls };
    }
    return {
      content:
        'Entendi sua mensagem, mas nao identifiquei uma acao clara. Reformule com o valor e a operacao (ex.: "registre uma despesa de 150 de combustivel").',
      toolCalls: [],
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'stub sempre disponivel' };
  }
}
