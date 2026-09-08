import type { ChannelType, MessageRole } from '@prisma/client';
import { prisma } from '../core/prisma';
import { currentCompanyId } from '../core/context';
import type { ChatMessage } from './provider/types';

const HISTORY_LIMIT = 16;

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

export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
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

export async function listConversations() {
  return prisma.conversation.findMany({
    where: { companyId: currentCompanyId() },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });
}

export async function getMessages(conversationId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, companyId: currentCompanyId() },
  });
  if (!conv) return null;
  return prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
}
