import { randomUUID } from 'node:crypto';
import type { ChannelType } from '@prisma/client';
import { runWithContext, type RequestContext } from '../core/context';
import { prisma } from '../core/prisma';
import { logger } from '../core/logger';
import { runOrchestrator } from '../ai/orchestrator';
import { findLink, redeemPairingCode } from './channels.service';

const CODE_RE = /^[A-Z0-9]{6}$/i;

/**
 * Ponto de entrada unico para mensagens vindas de qualquer canal externo
 * (Telegram, WhatsApp). Resolve o tenant pelo vinculo do canal, estabelece o
 * contexto e delega ao orchestrator.
 */
export async function handleInboundMessage(params: {
  channel: ChannelType;
  externalId: string;
  text: string;
  displayName?: string | null;
}): Promise<string> {
  const text = params.text.trim();
  const link = await findLink(params.channel, params.externalId);

  if (!link || !link.active) {
    const code = text.replace(/^\/start\s+/i, '').trim();
    if (CODE_RE.test(code)) {
      const redeemed = await redeemPairingCode({
        code,
        channel: params.channel,
        externalId: params.externalId,
        displayName: params.displayName ?? null,
      });
      if (redeemed) {
        return `Pronto! Este canal agora esta conectado a *${redeemed.companyName}*. Pode me pedir o que precisar (ex.: "quanto vendi hoje?").`;
      }
      return 'Codigo invalido ou expirado. Gere um novo no painel web em Configuracoes > Canais.';
    }
    return (
      'Este canal ainda nao esta vinculado a uma empresa.\n' +
      'No painel web, va em Configuracoes > Canais, gere um codigo e envie aqui: /start SEUCODIGO'
    );
  }

  const company = await prisma.company.findUnique({ where: { id: link.companyId } });
  const ctx: RequestContext = {
    companyId: link.companyId,
    userId: link.linkedUserId ?? null,
    role: null,
    source: params.channel.toLowerCase(),
    requestId: randomUUID(),
  };

  return runWithContext(ctx, async () => {
    try {
      const result = await runOrchestrator({
        text,
        channel: params.channel,
        externalId: params.externalId,
        companyName: company?.name ?? 'Empresa',
        userName: link.displayName,
      });
      return result.reply;
    } catch (err) {
      logger.error({ err, channel: params.channel }, 'Falha ao processar mensagem inbound');
      return 'Tive um problema ao processar isso agora. Tente novamente em instantes.';
    }
  });
}
