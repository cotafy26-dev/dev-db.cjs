import { env } from '../core/env';
import { AppError } from '../core/errors';

/**
 * Protecoes da IA (secao 30). O prompt do sistema ja instrui o modelo a ignorar
 * tentativas de override; aqui aplicamos rate limiting e uma sanitizacao leve
 * de marcadores de prompt-injection na mensagem do usuario.
 */

const INJECTION_PATTERNS = [
  /ignore (as|todas as) (regras|instrucoes|instruções)/i,
  /desconsidere (as|o) (regras|system prompt|prompt)/i,
  /voce agora (e|é) (um|uma)/i,
  /reveal (the )?system prompt/i,
  /mostre (o )?(system )?prompt/i,
  /outra empresa|other company|another tenant/i,
];

export function sanitizeUserMessage(text: string): { clean: string; flagged: boolean } {
  const flagged = INJECTION_PATTERNS.some((re) => re.test(text));
  // Nao removemos o texto (o modelo precisa entender o pedido), apenas sinalizamos
  // e encapsulamos para deixar claro que e conteudo do usuario, nao instrucao.
  const clean = text.length > 4000 ? text.slice(0, 4000) : text;
  return { clean, flagged };
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Rate limit por (empresa+usuario) para chamadas de IA (secao 30: abuso de API). */
export function checkAiRateLimit(key: string): void {
  const now = Date.now();
  const limit = env.AI_RATE_PER_MIN;
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (b.count >= limit) {
    throw new AppError('AI_RATE_LIMITED', 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.', 429);
  }
  b.count += 1;
}
