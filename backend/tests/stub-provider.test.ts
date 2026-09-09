import { describe, expect, it } from 'vitest';
import { StubProvider } from '../src/ai/provider/stub';
import type { ChatMessage } from '../src/ai/provider/types';

const provider = new StubProvider();
const user = (content: string): ChatMessage[] => [
  { role: 'system', content: 'sys' },
  { role: 'user', content },
];

describe('StubProvider - intencoes PT-BR -> tools em ingles', () => {
  it('venda: "Joao comprou 3 camisas por 80 reais cada e pagou no Pix"', async () => {
    const res = await provider.chat({ messages: user('Joao comprou 3 camisas por 80 reais cada e pagou no Pix') });
    expect(res.toolCalls[0]?.name).toBe('create_sale');
    const a = JSON.parse(res.toolCalls[0]!.arguments);
    expect(a.items[0].quantity).toBe(3);
    expect(a.items[0].unitPrice).toBe(80);
    expect(a.paymentMethod).toBe('PIX');
    expect(a.customerName.toLowerCase()).toContain('joao');
  });

  it('despesa: "Paguei 120 reais de energia"', async () => {
    const res = await provider.chat({ messages: user('Paguei 120 reais de energia') });
    expect(res.toolCalls[0]?.name).toBe('create_expense');
    expect(JSON.parse(res.toolCalls[0]!.arguments).amount).toBe(120);
  });

  it('recebimento: "Joao me pagou 300"', async () => {
    const res = await provider.chat({ messages: user('Joao me pagou 300') });
    expect(res.toolCalls[0]?.name).toBe('register_payment');
    expect(JSON.parse(res.toolCalls[0]!.arguments).amount).toBe(300);
  });

  it('cliente / vendas / receber / devedores / estoque', async () => {
    expect((await provider.chat({ messages: user('Cadastre Maria como cliente') })).toolCalls[0]?.name).toBe('create_customer');
    expect((await provider.chat({ messages: user('Quanto vendi hoje?') })).toolCalls[0]?.name).toBe('sales_summary');
    expect((await provider.chat({ messages: user('Quanto tenho para receber?') })).toolCalls[0]?.name).toBe('get_receivables');
    expect((await provider.chat({ messages: user('Quem esta devendo?') })).toolCalls[0]?.name).toBe('list_overdue_customers');
    expect((await provider.chat({ messages: user('Quais produtos estao acabando?') })).toolCalls[0]?.name).toBe('low_stock_products');
  });

  it('resume o resultado de uma tool a partir de result.message', async () => {
    const res = await provider.chat({
      messages: [
        { role: 'user', content: 'Quanto tenho para receber?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'get_receivables', arguments: '{}' }] },
        { role: 'tool', content: JSON.stringify({ total: 4850, overdue: 950, message: 'Voce possui R$ 4.850,00 para receber.' }), toolCallId: 't1' },
      ],
    });
    expect(res.toolCalls).toHaveLength(0);
    expect(res.content).toContain('4.850');
  });

  it('mensagem sem acao', async () => {
    const res = await provider.chat({ messages: user('bom dia') });
    expect(res.toolCalls).toHaveLength(0);
    expect(res.content.length).toBeGreaterThan(0);
  });
});
