import type { ChannelType, MessageRole } from '@prisma/client';
import { prisma } from '../core/prisma';
import { env } from '../core/env';
import { currentCompanyId } from '../core/context';
import { scope } from '../core/tenant';
import type { ChatMessage } from './provider/types';

export interface OperationalMemory {
  lastCustomerId?: string;
  lastCustomerName?: string;
  lastProductId?: string;
  lastProductName?: string;
  lastSaleNumber?: number;
  pendingAction?: unknown;
}

export async function getOrCreateConversation(params: {
  channel: ChannelType;
  externalId?: string | null;
  userId?: string | null;
}) {
  const companyId = currentCompanyId();
  const externalId = params.externalId ?? null;
  const existing = await prisma.conversation.findFirst({
    where: { companyId, channel: params.channel, externalId },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { companyId, channel: params.channel, externalId, userId: params.userId ?? null },
  });
}

/**
 * Historico para o modelo: as ultimas N mensagens. As anteriores ficam
 * condensadas no campo `summary` da conversa (secao 16/20 - nao enviar tudo).
 */
export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: env.AI_HISTORY_MESSAGES,
  });
  rows.reverse();

  return rows.map((m): ChatMessage => {
    if (m.role === 'ASSISTANT' && m.toolName && m.toolArgs) {
      return {
        role: 'assistant',
        content: m.content,
        toolCalls: [{ id: m.toolCallId ?? m.id, name: m.toolName, arguments: JSON.stringify(m.toolArgs) }],
      };
    }
    if (m.role === 'TOOL') {
      return { role: 'tool', content: m.content, toolCallId: m.toolCallId ?? undefined, name: m.toolName ?? undefined };
    }
    return { role: m.role.toLowerCase() as ChatMessage['role'], content: m.content };
  });
}

export async function appendMessage(
  conversationId: string,
  msg: {
    role: MessageRole;
    content: string;
    toolName?: string | null;
    toolCallId?: string | null;
    toolArgs?: unknown;
    toolResult?: unknown;
    tokensIn?: number;
    tokensOut?: number;
  },
) {
  await prisma.message.create({
    data: {
      conversationId,
      role: msg.role,
      content: msg.content,
      toolName: msg.toolName ?? null,
      toolCallId: msg.toolCallId ?? null,
      toolArgs: (msg.toolArgs ?? undefined) as never,
      toolResult: (msg.toolResult ?? undefined) as never,
      tokensIn: msg.tokensIn ?? null,
      tokensOut: msg.tokensOut ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}

export async function getMemory(conversationId: string): Promise<{ summary: string | null; memory: OperationalMemory }> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { summary: true, memory: true },
  });
  return { summary: conv?.summary ?? null, memory: (conv?.memory as OperationalMemory) ?? {} };
}

export async function updateMemory(conversationId: string, patch: Partial<OperationalMemory>) {
  const cur = await getMemory(conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { memory: { ...cur.memory, ...patch } as never },
  });
}

/**
 * Condensa mensagens antigas quando a conversa cresce (secao 16). Estrategia
 * simples e deterministica: acumula um resumo textual das trocas que sairao da
 * janela; nao chama o modelo para nao aumentar custo/latencia.
 */
export async function maybeSummarize(conversationId: string): Promise<void> {
  const total = await prisma.message.count({ where: { conversationId } });
  const keep = env.AI_HISTORY_MESSAGES;
  if (total <= keep * 2) return;

  const old = await prisma.message.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'asc' },
    take: total - keep,
  });
  const bullets = old
    .filter((m) => m.content?.trim())
    .slice(-30)
    .map((m) => `${m.role === 'USER' ? 'U' : 'H'}: ${m.content.slice(0, 160)}`)
    .join(' | ');

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { summary: true } });
  const merged = [conv?.summary, bullets].filter(Boolean).join(' | ').slice(0, 4000);
  await prisma.conversation.update({ where: { id: conversationId }, data: { summary: merged } });
}

export async function listConversations() {
  return prisma.conversation.findMany({
    where: { companyId: currentCompanyId() },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });
}

export async function getMessages(conversationId: string) {
  const conv = await prisma.conversation.findFirst({ where: { ...scope(), id: conversationId } });
  if (!conv) return null;
  return prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
}
