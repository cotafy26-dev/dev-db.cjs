import type { ChannelType } from '@prisma/client';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { prisma } from '../core/prisma';
import { currentCompanyId, currentUserId } from '../core/context';
import { getAIProvider } from './provider';
import type { ChatMessage } from './provider/types';
import { buildSystemPrompt } from './system-prompt';
import { executeTool, getToolSchemas } from './tools';
import {
  appendMessage,
  getOrCreateConversation,
  loadHistory,
} from './conversations.service';

export interface OrchestratorInput {
  text: string;
  channel: ChannelType;
  externalId?: string | null;
  companyName: string;
  userName?: string | null;
}

export interface OrchestratorResult {
  reply: string;
  conversationId: string;
  toolCalls: { name: string; status: string }[];
  iterations: number;
}

async function auditToolCall(
  conversationId: string,
  name: string,
  args: unknown,
  status: string,
  result: unknown,
  error: string | undefined,
  durationMs: number,
): Promise<void> {
  try {
    await prisma.aiToolCall.create({
      data: {
        companyId: currentCompanyId(),
        conversationId,
        toolName: name,
        args: (args ?? {}) as never,
        status,
        result: (result ?? undefined) as never,
        error: error ?? null,
        durationMs,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Falha ao gravar auditoria de tool call');
  }
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const provider = getAIProvider();
  const toolSchemas = getToolSchemas();

  const conversation = await getOrCreateConversation({
    channel: input.channel,
    externalId: input.externalId ?? null,
    userId: currentUserId(),
  });

  const history = await loadHistory(conversation.id);
  await appendMessage(conversation.id, { role: 'USER', content: input.text });

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ companyName: input.companyName, userName: input.userName, channel: input.channel }) },
    ...history,
    { role: 'user', content: input.text },
  ];

  const executed: { name: string; status: string }[] = [];
  let iterations = 0;

  for (let i = 0; i < env.AI_MAX_TOOL_ITERATIONS; i++) {
    iterations = i + 1;

    const res = await provider.chat({ messages, tools: toolSchemas });

    if (!res.toolCalls.length) {
      const reply = res.content?.trim() || 'Certo.';
      messages.push({ role: 'assistant', content: reply });
      await appendMessage(conversation.id, {
        role: 'ASSISTANT',
        content: reply,
        tokensIn: res.usage?.promptTokens,
        tokensOut: res.usage?.completionTokens,
      });
      return { reply, conversationId: conversation.id, toolCalls: executed, iterations };
    }

    // Registra a mensagem do assistente com as chamadas de ferramenta.
    messages.push({ role: 'assistant', content: res.content ?? '', toolCalls: res.toolCalls });

    for (const tc of res.toolCalls) {
      let args: unknown = {};
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        args = {};
      }

      const started = Date.now();
      const exec = await executeTool(tc.name, args);
      const durationMs = Date.now() - started;

      const payload =
        exec.status === 'SUCCESS'
          ? exec.result
          : exec.status === 'REJECTED'
            ? exec.result
            : { error: exec.error };

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
      await auditToolCall(conversation.id, tc.name, args, exec.status, exec.result, exec.error, durationMs);

      executed.push({ name: tc.name, status: exec.status });
      logger.info({ tool: tc.name, status: exec.status, durationMs }, 'tool executada');
    }
  }

  const fallback =
    'Precisei de passos demais para concluir e parei por seguranca. Pode detalhar melhor o pedido?';
  await appendMessage(conversation.id, { role: 'ASSISTANT', content: fallback });
  return { reply: fallback, conversationId: conversation.id, toolCalls: executed, iterations };
}
