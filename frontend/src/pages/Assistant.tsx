import { FormEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, Input, PageHeader } from '../components/ui';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  tools?: { name: string; status: string }[];
}

const SUGESTOES = [
  'Quanto vendi hoje?',
  'Registre uma despesa de 150 de combustível',
  'Quem está devendo?',
  'Quais produtos estão acabando?',
  'Cadastre Maria como cliente',
];

export function AssistantPage() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Olá! Sou o Tato. Peça em linguagem natural: vendas, despesas, cobranças, estoque, agenda...' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { message: text });
      const { reply, toolCalls } = res.data.data;
      setMessages((m) => [...m, { role: 'assistant', content: reply, tools: toolCalls }]);
      qc.invalidateQueries();
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `Erro: ${apiErrorMessage(err)}` }]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div>
      <PageHeader title="Assistente IA" subtitle="Converse para executar ações no sistema" />
      <Card className="flex h-[70vh] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white'
                    : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                }
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tools.map((t, j) => (
                      <span key={j} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {t.name} · {t.status}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-sm text-slate-400">Tato está pensando...</div>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva uma mensagem..." />
            <Button type="submit" disabled={loading}>
              Enviar
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
