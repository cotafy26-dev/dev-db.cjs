import type { ChannelType } from '@prisma/client';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { prisma } from '../core/prisma';
import { currentCompanyId, currentUserId } from '../core/context';
import { audit } from '../core/audit';
import { getAIProvider } from './provider';
import type { ChatMessage } from './provider/types';
import { buildSystemPrompt } from './system-prompt';
import { executeTool, toolSchemasForCurrentRole } from './tools';
import { checkAiRateLimit, sanitizeUserMessage } from './security';
import {
  appendMessage,
  getMemory,
  getOrCreateConversation,
  loadHistory,
  maybeSummarize,
  updateMemory,
} from './conversations.service';

export interface OrchestratorInput {
  text: string;
  channel: ChannelType;
  externalId?: string | null;
  companyName: string;
  segment?: string | null;
  currency?: string;
  userName?: string | null;
  role?: string | null;
  timezone?: string;
}

export interface OrchestratorResult {
  reply: string;
  conversationId: string;
  toolCalls: { name: string; status: string }[];
  iterations: number;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const started = Date.now();
  const provider = getAIProvider();

  checkAiRateLimit(`${currentCompanyId()}:${currentUserId() ?? input.externalId ?? 'anon'}`);
  const { clean, flagged } = sanitizeUserMessage(input.text);
  if (flagged) {
    logger.warn({ companyId: currentCompanyId() }, 'Mensagem sinalizada por possivel prompt-injection');
  }

  const conversation = await getOrCreateConversation({
    channel: input.channel,
    externalId: input.externalId ?? null,
    userId: currentUserId(),
  });

  const [history, mem] = await Promise.all([loadHistory(conversation.id), getMemory(conversation.id)]);
  await appendMessage(conversation.id, { role: 'USER', content: clean });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        companyName: input.companyName,
        segment: input.segment,
        currency: input.currency,
        userName: input.userName,
        role: input.role,
        channel: input.channel,
        timezone: input.timezone,
        summary: mem.summary,
        memory: mem.memory as Record<string, unknown>,
      }),
    },
    ...history,
    { role: 'user', content: clean },
  ];

  const toolSchemas = toolSchemasForCurrentRole();
  const executed: { name: string; status: string }[] = [];
  let iterations = 0;
  let reply = 'Certo.';
  let status: 'SUCCESS' | 'ERROR' = 'SUCCESS';
  let errorMsg: string | undefined;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for (let i = 0; i < env.AI_MAX_TOOL_ITERATIONS; i++) {
      iterations = i + 1;
      const res = await provider.chat({ messages, tools: toolSchemas });
      tokensIn += res.usage?.promptTokens ?? 0;
      tokensOut += res.usage?.completionTokens ?? 0;

      if (!res.toolCalls.length) {
        reply = res.content?.trim() || 'Certo.';
        messages.push({ role: 'assistant', content: reply });
        await appendMessage(conversation.id, {
          role: 'ASSISTANT',
          content: reply,
          tokensIn: res.usage?.promptTokens,
          tokensOut: res.usage?.completionTokens,
        });
        break;
      }

      messages.push({ role: 'assistant', content: res.content ?? '', toolCalls: res.toolCalls });

      for (const tc of res.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          args = {};
        }

        const exec = await executeTool(tc.name, args);
        const payload = exec.status === 'ERROR' ? { error: exec.error } : exec.result;
        const content = JSON.stringify(payload ?? {});
        messages.push({ role: 'tool', content, toolCallId: tc.id, name: tc.name });

        await appendMessage(conversation.id, {
          role: 'ASSISTANT',
          content: res.content ?? '',
          toolName: tc.name,
          toolCallId: tc.id,
          toolArgs: args,
        });
        await appendMessage(conversation.id, {
          role: 'TOOL',
          content,
          toolName: tc.name,
          toolCallId: tc.id,
          toolResult: payload,
        });

        executed.push({ name: tc.name, status: exec.status });
        await rememberFromTool(conversation.id, tc.name, args, exec.result);
        logger.info({ tool: tc.name, status: exec.status }, 'tool executada');
      }

      if (iterations >= env.AI_MAX_TOOL_ITERATIONS) {
        reply = 'Precisei de passos demais e parei por seguranca. Pode detalhar melhor o pedido?';
        await appendMessage(conversation.id, { role: 'ASSISTANT', content: reply });
      }
    }
  } catch (err) {
    status = 'ERROR';
    errorMsg = err instanceof Error ? err.message : 'erro';
    reply =
      err && typeof err === 'object' && 'status' in err && (err as { status?: number }).status === 429
        ? errorMsg
        : 'Tive um problema ao processar isso agora. Tente novamente em instantes.';
    logger.error({ err }, 'Falha no orchestrator');
  }

  await maybeSummarize(conversation.id).catch(() => undefined);

  await prisma.aIExecution
    .create({
      data: {
        companyId: currentCompanyId(),
        conversationId: conversation.id,
        channel: input.channel,
        input: clean,
        output: reply,
        toolCalls: executed as never,
        status,
        error: errorMsg,
        iterations,
        tokensIn: tokensIn || null,
        tokensOut: tokensOut || null,
        durationMs: Date.now() - started,
        createdById: currentUserId(),
      },
    })
    .catch((err) => logger.warn({ err }, 'Falha ao gravar AIExecution'));

  if (executed.length > 0) {
    await audit({
      action: 'ai.execute',
      entityType: 'AIExecution',
      entityId: conversation.id,
      summary: `${input.channel}: ${executed.map((e) => `${e.name}(${e.status})`).join(', ')}`,
    });
  }

  return { reply, conversationId: conversation.id, toolCalls: executed, iterations };
}

/** Atualiza a memoria operacional (secao 20) com o ultimo cliente/produto/venda citados. */
async function rememberFromTool(
  conversationId: string,
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  const r = (result ?? {}) as Record<string, unknown>;

  if (typeof args.customerName === 'string') patch.lastCustomerName = args.customerName;
  if (typeof args.product === 'string') patch.lastProductName = args.product;
  if (tool === 'create_sale' && typeof r.number === 'number') patch.lastSaleNumber = r.number;
  if ((tool === 'create_customer' || tool === 'find_customer') && typeof r.id === 'string') patch.lastCustomerId = r.id;
  if ((tool === 'create_product' || tool === 'find_product') && typeof r.id === 'string') patch.lastProductId = r.id;

  if (Object.keys(patch).length) await updateMemory(conversationId, patch).catch(() => undefined);
}
