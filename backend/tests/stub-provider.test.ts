import { describe, expect, it } from 'vitest';
import { StubProvider } from '../src/ai/provider/stub';
import type { ChatMessage } from '../src/ai/provider/types';

const provider = new StubProvider();

function userMsg(content: string): ChatMessage[] {
  return [
    { role: 'system', content: 'sys' },
    { role: 'user', content },
  ];
}

describe('StubProvider - deteccao de intencao', () => {
  it('despesa', async () => {
    const res = await provider.chat({ messages: userMsg('Registre uma despesa de 150 reais de combustivel') });
    expect(res.toolCalls[0]?.name).toBe('registrar_despesa');
    const args = JSON.parse(res.toolCalls[0]!.arguments);
    expect(args.amount).toBe(150);
  });

  it('recebimento (X me pagou Y)', async () => {
    const res = await provider.chat({ messages: userMsg('Joao me pagou 300 reais') });
    expect(res.toolCalls[0]?.name).toBe('registrar_recebimento');
    const args = JSON.parse(res.toolCalls[0]!.arguments);
    expect(args.amount).toBe(300);
    expect(args.customerName.toLowerCase()).toContain('joao');
  });

  it('cadastro de cliente', async () => {
    const res = await provider.chat({ messages: userMsg('Cadastre Maria como cliente') });
    expect(res.toolCalls[0]?.name).toBe('cadastrar_cliente');
  });

  it('quanto vendi hoje', async () => {
    const res = await provider.chat({ messages: userMsg('Quanto vendi hoje?') });
    expect(res.toolCalls[0]?.name).toBe('resumo_vendas');
    expect(JSON.parse(res.toolCalls[0]!.arguments).period).toBe('hoje');
  });

  it('a receber / devedores / vencimentos / estoque', async () => {
    expect((await provider.chat({ messages: userMsg('Quanto tenho para receber?') })).toolCalls[0]?.name).toBe('total_a_receber');
    expect((await provider.chat({ messages: userMsg('Quem esta devendo?') })).toolCalls[0]?.name).toBe('lista_devedores');
    expect((await provider.chat({ messages: userMsg('Quais contas vencem amanha?') })).toolCalls[0]?.name).toBe('contas_a_vencer');
    expect((await provider.chat({ messages: userMsg('Quais produtos estao acabando?') })).toolCalls[0]?.name).toBe('produtos_estoque_baixo');
  });

  it('venda com pix', async () => {
    const res = await provider.chat({
      messages: userMsg('Registre uma venda de 2 camisas por 80 reais para Joao no Pix'),
    });
    expect(res.toolCalls[0]?.name).toBe('registrar_venda');
    const args = JSON.parse(res.toolCalls[0]!.arguments);
    expect(args.items[0].quantity).toBe(2);
    expect(args.items[0].unitPrice).toBe(80);
    expect(args.paymentMethod).toBe('PIX');
  });

  it('resume o resultado de uma tool', async () => {
    const res = await provider.chat({
      messages: [
        { role: 'user', content: 'Quanto tenho para receber?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'total_a_receber', arguments: '{}' }] },
        { role: 'tool', content: JSON.stringify({ total: 450 }), toolCallId: 't1' },
      ],
    });
    expect(res.toolCalls).toHaveLength(0);
    expect(res.content).toContain('450');
  });

  it('mensagem sem acao', async () => {
    const res = await provider.chat({ messages: userMsg('bom dia') });
    expect(res.toolCalls).toHaveLength(0);
    expect(res.content.length).toBeGreaterThan(0);
  });
});
